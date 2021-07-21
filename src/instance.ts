import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import { Address6 } from 'ip-address'

// https://aws.amazon.com/blogs/compute/query-for-the-latest-amazon-linux-ami-ids-using-aws-systems-manager-parameter-store/
export const getAmazonLinux2AmiId = (
    args?: {
        arch?: 'x86_64' | 'arm64'
    },
    opts?: pulumi.InvokeOptions,
): Promise<string> => {
    return aws.ssm
        .getParameter(
            {
                name: `/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-hvm-${
                    args?.arch ?? 'x86_64'
                }-ebs`,
            },
            { ...opts, async: true },
        )
        .then((result) => result.value)
        .catch((reason) => {
            pulumi.log.error(`Error getting Amazon Linux 2 AMI ID: ${reason}`)
            throw reason
        })
}

export const logins = {
    bennett: [
        'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAO1Tdp+UuSgRQO9krfyqZXSVMt6mSH1RZX2AWxQboxH bennett@MacBook Pro 16',
    ],
}

export const sudoers = ['bennett']

// examples: https://cloudinit.readthedocs.io/en/latest/topics/examples.html#including-users-and-groups
export const users = Object.entries(logins)
    .map(([name, ssh_authorized_keys]) => {
        return {
            name,
            ssh_authorized_keys,
            ...(sudoers.includes(name)
                ? { sudo: 'ALL=(ALL) NOPASSWD:ALL' }
                : {}),
        }
    })
    .filter((user) => user.ssh_authorized_keys.length > 0)

export const userData = `#cloud-config
repo_upgrade: all
ssh_deletekeys: true
users: ${JSON.stringify(users)}
repo_update: true
yum_repos:
  epel:
    name: Extra Packages for Enterprise Linux 7 - $basearch
    mirrorlist: https://mirrors.fedoraproject.org/metalink?repo=epel-7&arch=$basearch&infra=$infra&content=$contentdir
    failovermethod: priority
    enabled: true
    gpgcheck: true
    gpgkey: https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-7
`

/**
 * An Instance provides a cheap, persistent spot instance (t3a.nano, less than
 * $2 per month), and associated boilerplate to make sure it is persistent.
 *
 * Optionally, it can have a fixed IP and IPv6 address. The fixed IPv4 is useful
 * if the private address needs to remain unchanged.
 *
 * You can also create a fixed public address using an EIP.
 *
 * If DNS settings are provided, an A record will be created with either the
 * public address, or the private address. An AAAA record will be created too.
 */
export class Instance extends pulumi.ComponentResource {
    ip: pulumi.Output<string>
    privateIp: pulumi.Output<string>
    publicIp?: pulumi.Output<string>
    ipv6: pulumi.Output<string>
    hostname?: pulumi.Output<string>
    instanceId: pulumi.Output<string>
    interfaceId: pulumi.Output<string>

    constructor(
        name: string,
        args: {
            subnetIds: pulumi.Input<string[]>
            vpcId: pulumi.Input<string>
            securityGroupIds: pulumi.Input<string>[]

            /**
             * if set, A and AAAA records will be created
             * with the hostname and zone specified
             */
            dns?: {
                zone: pulumi.Input<string>
                hostname: pulumi.Input<string>
            }

            userData: pulumi.Input<string>

            network?: {
                /**
                 * If enabled, a fixed IPv4 address will be maintained
                 * across instance recreation. Otherwise, an IP address
                 * will be allocated by AWS.
                 */
                fixedIp?: boolean

                /** If enabled, an EIP will be created and allocated. */
                useEIP?: boolean

                /**
                 * If enabled, a fixed IPv6 address will be maintained
                 * across instance recreation. Otherwise, an IPv6 address
                 * will be allocated by AWS.
                 */
                fixedIpv6?: boolean

                /**
                 * If enabled, an ENI will be created separately to the
                 * instance. Otherwise, it will just use the default ENI
                 * created by AWS.
                 */
                useENI?: boolean

                /**
                 * implies useENI
                 */
                sourceDestCheck?: boolean
            }
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:instance/Instance', name, args, opts)

        const subnet = pulumi
            .all([args.subnetIds, args.vpcId])
            .apply(async ([ids, vpcId]) => {
                const id = ids[0]
                return await aws.ec2.getSubnet(
                    {
                        id,
                        vpcId,
                    },
                    { parent: this, async: true },
                )
            })

        // an Elastic IP provides a static IP address
        const eip = args.network?.useEIP
            ? new aws.ec2.Eip(`${name}-eip`, { vpc: true }, { parent: this })
            : undefined

        const tenyears = 10 * 365 * 24 * 60 * 60 * 1000

        const ipSuffix = args.network?.fixedIp
            ? new random.RandomInteger(
                  `${name}-ip-suffix`,
                  {
                      min: 100,
                      max: 200,
                  },
                  { parent: this },
              )
            : undefined

        const ipv6Suffixes = args.network?.fixedIpv6
            ? [0, 1, 2, 3].map(
                  (_, i) =>
                      new random.RandomString(
                          `${name}-ip-suffix-${i}`,
                          {
                              length: 4,
                              lower: false,
                              upper: false,
                              special: true,
                              number: true,
                              minNumeric: 1,
                              overrideSpecial: 'abcdef',
                          },
                          { parent: this },
                      ),
              )
            : undefined

        const privateIp = ipSuffix
            ? pulumi
                  .all([subnet, ipSuffix.result])
                  .apply(([s, suffix]) =>
                      s.cidrBlock.replace(/\.\d*\/*\d*$/, `.${suffix}`),
                  )
            : undefined

        const privateIpv6 = ipv6Suffixes
            ? pulumi
                  .all([
                      subnet,
                      ipv6Suffixes[0].result,
                      ipv6Suffixes[1].result,
                      ipv6Suffixes[2].result,
                      ipv6Suffixes[3].result,
                  ])
                  .apply(([s, snippet1, snippet2, snippet3, snippet4]) => {
                      const subnet = new Address6(s.ipv6CidrBlock)
                      if (subnet.subnetMask > 64) {
                          throw new pulumi.ResourceError(
                              'fixed IPv6 needs /64 or larger',
                              this,
                          )
                      }
                      const ip = new Address6(
                          [
                              ...subnet.canonicalForm().split(':').slice(0, 4),
                              snippet1,
                              snippet2,
                              snippet3,
                              snippet4,
                          ].join(':') + '/128',
                      )
                      return ip.correctForm()
                  })
            : undefined

        const networkSettings = {
            subnetId: pulumi.output(args.subnetIds).apply((ids) => ids[0]),
            ...(args.network?.sourceDestCheck !== undefined
                ? {
                      sourceDestCheck: args.network?.sourceDestCheck,
                  }
                : {}),
            securityGroups: args.securityGroupIds,
            ...(privateIp ? { privateIps: [privateIp] } : {}),
            ...(privateIpv6 ? { ipv6Addresses: [privateIpv6] } : {}),
        }

        // create the nic explicitly here
        //   - SpotInstanceRequest doesn't do sourceDestCheck properly
        //   - routes persist after instance recreation
        const nic = args.network?.useENI
            ? new aws.ec2.NetworkInterface(
                  `${name}-interface`,
                  networkSettings,
                  {
                      parent: this,
                      deleteBeforeReplace: true,
                      replaceOnChanges: [
                          'privateIp', // the API does not allow these to change
                          'privateIps',
                      ],
                  },
              )
            : undefined

        // the smollest possible instance type
        const instance = new aws.ec2.SpotInstanceRequest(
            `${name}-instance`,
            {
                instanceType: 't3a.nano',
                ami: getAmazonLinux2AmiId({ arch: 'x86_64' }, { parent: this }),
                ...(nic
                    ? {
                          networkInterfaces: [
                              {
                                  deviceIndex: 0,
                                  networkInterfaceId: nic.id,
                                  deleteOnTermination: false, // pulumi will delete it for us
                              },
                          ],
                      }
                    : networkSettings),
                userData: args.userData,
                rootBlockDevice: {
                    deleteOnTermination: true,
                    volumeSize: 4,
                    volumeType: 'gp3',
                },
                instanceInitiatedShutdownBehavior: 'stop',
                spotType: 'persistent',
                creditSpecification: {
                    cpuCredits: 'standard',
                },
                disableApiTermination: true,
                instanceInterruptionBehaviour: 'stop',
                waitForFulfillment: true,
                validUntil: `${
                    new Date(
                        // reset date about every 10 years
                        Date.now() +
                            tenyears -
                            ((Date.now() + tenyears) % tenyears),
                    )
                        .toISOString()
                        .replace(/000Z$/, '00Z') // just the last two zeros
                }`,
            },
            {
                parent: this,
                ignoreChanges: ['validUntil'],
                deleteBeforeReplace: true,
            },
        )

        this.interfaceId = nic?.id ?? instance.primaryNetworkInterfaceId
        this.instanceId = instance.spotInstanceId

        if (eip) {
            // associates the static IP with the instance
            new aws.ec2.EipAssociation(
                `${name}-eip-assoc`,
                {
                    publicIp: eip?.publicIp,
                    instanceId: instance.spotInstanceId,
                },
                { parent: this },
            )
            this.ip = eip.publicIp
        } else {
            this.ip = instance.publicIp ?? instance.privateIp
        }

        this.publicIp = instance.publicIp
        this.privateIp = instance.privateIp
        this.ipv6 = nic
            ? pulumi
                  .output(nic.ipv6Addresses)
                  .apply((addresses) => addresses.join(', '))
            : pulumi
                  .output(instance.ipv6Addresses)
                  .apply((addresses) => addresses.join(', '))

        if (args.dns?.zone && args.dns?.hostname) {
            const aaaa = new aws.route53.Record(
                `${name}-aaaa`,
                {
                    name: args.dns.hostname,
                    type: 'AAAA',
                    zoneId: args.dns.zone,
                    ttl: args.network?.fixedIpv6 ? 3600 : 300,
                    records: [this.ipv6],
                },
                {
                    parent: this,
                    deleteBeforeReplace: true,
                },
            )

            const a = new aws.route53.Record(
                `${name}-a`,
                {
                    name: args.dns.hostname,
                    type: 'A',
                    zoneId: args.dns.zone,
                    ttl:
                        args.network?.fixedIp || args.network?.useEIP
                            ? 3600
                            : 300,
                    records: [this.ip],
                },
                {
                    parent: this,
                    deleteBeforeReplace: true,
                },
            )

            this.hostname = pulumi
                .all([aaaa.fqdn, a.fqdn])
                .apply(([fqdn, _]) => fqdn)
        }
    }
}
