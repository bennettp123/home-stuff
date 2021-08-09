import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import * as random from '@pulumi/random'
import * as tls from '@pulumi/tls'
import { Address6 } from 'ip-address'
import {
    addHostKeys,
    getTags,
    makeCloudInitUserdata,
    prependCmds,
    SshHostKeys,
} from './helpers'

export const config = new pulumi.Config('instance')

export type SshKey = string
export type DefaultInstanceSettings = {
    logins?: {
        [username: string]: Array<SshKey>
    }
    sudoers?: Array<string>
}

export const defaults =
    config.getObject<DefaultInstanceSettings>('default-users')

// examples: https://cloudinit.readthedocs.io/en/latest/topics/examples.html#including-users-and-groups
export const users = Object.entries(defaults?.logins ?? [])
    .map(([name, ssh_authorized_keys]) => {
        return {
            name,
            ssh_authorized_keys,
            ...((defaults?.sudoers ?? []).includes(name)
                ? { sudo: 'ALL=(ALL) NOPASSWD:ALL' }
                : {}),
            passwd: '$6$rounds=4096$00dGvNxeJdL0$yK0ssssl5zyEXQGHL7IKJRE3LqCrV7W2svJDwOPg.nkXscZkJ1/dPlYsEz512XkVQwQ/iR/QTn22g2YMnvp4z1',
        }
    })
    .filter((user) => user.ssh_authorized_keys.length > 0)

const upgrade = `#!/bin/sh
set -e

# upgrade the things
yum makecache -y
yum upgrade -y
`

const upgradeAndReboot = `${upgrade}
# reboot if needed
if which needs-restarting >/dev/null 2>&1; then
  cloud-init status --wait --long
  needs-restarting -r || shutdown -r now
fi
`

export const scripts = {
    upgrade,
    upgradeAndReboot,
}

const upgradeScriptPath = '/etc/cron.hourly/automatic-upgrades'

/**
 * The default userData for instance.
 * Creates users, updates all packages, adds EPEL repo.
 * Must be converted to cloud-init format before it's usable. This can be done
 * using makeCloudInitUserdata in ./cloud-init-helpers
 */
export const userData = {
    repo_upgrade: 'all',
    packages: ['jq', 'bind-utils', 'traceroute', 'yum-utils'],
    ssh_deletekeys: true,
    ...(users.length > 0 ? { users } : {}),
    repo_update: true,
    yum_repos: {
        epel: {
            name: 'Extra Packages for Enterprise Linux 7 - $basearch',
            mirrorlist:
                'https://mirrors.fedoraproject.org/metalink?repo=epel-7&arch=$basearch&infra=$infra&content=$contentdir',
            failovermethod: 'priority',
            enabled: true,
            gpgcheck: true,
            gpgkey: 'https://dl.fedoraproject.org/pub/epel/RPM-GPG-KEY-EPEL-7',
        },
    },
    ssh: {
        emit_keys_to_console: false,
    },
    write_files: [
        {
            path: upgradeScriptPath,
            owner: 'root:root',
            permissions: '0755',
            content: upgradeAndReboot,
        },
    ],
    runcmd: ['systemctl reload crond'],
    bootcmd: [],
}

export interface InstanceArgs {
    /**
     * The instance will be added to subnets with these IDs
     */
    subnetIds: pulumi.Input<string[]>
    /**
     * The instance will be added to the VPC with this ID
     */
    vpcId: pulumi.Input<string>
    /**
     * Security groups with these IDs will be attached to the instance
     */
    securityGroupIds: pulumi.Input<string>[]
    /**
     * The instance type. Must support either x86_64 or arm64.
     */
    instanceType: pulumi.Input<string>
    /**
     * The userdata to add to the instance. If not provided, the default
     * userdata sets up the EPEL repo, updates all packages, and creates a
     * users (if default-users is defined in config).
     */
    userData?:
        | pulumi.Input<{
              write_files?:
                  | {
                        path?: string | undefined
                        owner?: string | undefined
                        permissions?: string | undefined
                        content?: string | undefined
                        [key: string]: unknown
                    }[]
                  | undefined
              [key: string]: unknown
          }>
        | Promise<
              pulumi.Input<{
                  write_files?:
                      | {
                            path?: string | undefined
                            owner?: string | undefined
                            permissions?: string | undefined
                            content?: string | undefined
                            [key: string]: unknown
                        }[]
                      | undefined
                  [key: string]: unknown
              }>
          >
    /**
     * if set, A and AAAA records will be created
     * with the hostname and zone specified
     */
    dns?: {
        zone: pulumi.Input<string>
        hostname?: pulumi.Input<string>
    }
    network?: {
        /**
         * If enabled, a fixed IPv4 address will be maintained
         * across instance recreation. Otherwise, an IP address
         * will be allocated by AWS.
         */
        fixedPrivateIp?: boolean
        /** If enabled, a fixed public IP will be created and
         * allocated.
         */
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
    /**
     * Add SSH host keys. If not specified, an ECDSA host key will be created.
     */
    sshHostKeys?: pulumi.Input<SshHostKeys>
    /**
     * By default, instances will reboot after appling kernel upgrade. Set
     * this to false to disable these upgrades.
     */
    rebootForKernelUpdates?: boolean
    /**
     * An SNS topic for sending notifications
     */
    notificationsTopicArn?: pulumi.Input<string>

    /**
     * An optional role to assign to the EC2 instance.
     */
    instanceRoleId?: pulumi.Input<string>

    /**
     * Override the default Amazon Linux 2 AMI
     */
    amiId?: pulumi.Input<string>

    /**
     * Override the size of the root volume.
     */
    rootVolumeSize?: pulumi.Input<number>

    /**
     * If true:
     *   - the instance will be terminated
     *   - the ENI will be deleted
     *   - the EIP (if enabled) will be retained, but remain unattached
     *   - other resources will be retained
     */
    offline?: boolean
}

/**
 * An Instance provides a cheap, persistent spot instance, and (optional)
 * boilerplate to make it more* persistent.
 *
 * Note that practically any change to a SpotInstanceRequest results in the
 * termination and recreation of the underlying instance. Therefore, you should
 * strive to ensure that everything on the instance is installed and configured
 * automatically at launch. Any data or configuration that needs to be saved
 * should be saved elsewhere, such as an S3 bucket or an external filesystem.
 *
 * Optionally, it can have a fixed (private)IP and IPv6 address. The fixed IPv4 is
 * useful if the private address needs to remain unchanged.
 *
 * You can also create a fixed public address using an EIP.
 *
 * If DNS settings are provided, an A record will be created with either the
 * public address, or the private address. An AAAA record will be created too.
 */
export class Instance extends pulumi.ComponentResource {
    /**
     * If the instance has a public IP, then this will be the public IP.
     * Otherwise, it will be the private IP.
     */
    ip: pulumi.Output<string>

    /**
     * The private IP of the instance
     */
    privateIp?: pulumi.Output<string>

    /**
     * The public IP of the instance, if it has one
     */
    publicIp?: pulumi.Output<string>

    /**
     * The IPv6 of the instance
     */
    ipv6?: pulumi.Output<string>

    /**
     * If a route53 zone was provided, the hostname of the instance
     */
    hostname?: pulumi.Output<string>

    /**
     * The instance ID of the instance
     */
    instanceId?: pulumi.Output<string>

    /**
     * The ID of the interface attached to the instance
     */
    interfaceId?: pulumi.Output<string>

    constructor(
        name: string,
        args: InstanceArgs,
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
            ? new aws.ec2.Eip(
                  `${name}-eip`,
                  { vpc: true, tags: getTags({ Name: `${name}-eip` }) },
                  { parent: this },
              )
            : undefined

        const tenyears = 10 * 365 * 24 * 60 * 60 * 1000

        const ipSuffix = args.network?.fixedPrivateIp
            ? new random.RandomInteger(
                  `${name}-private-ip-suffix`,
                  {
                      min: 10,
                      max: 250,
                  },
                  { parent: this },
              )
            : undefined

        const ipv6Suffixes = args.network?.fixedIpv6
            ? [0, 1, 2, 3].map(
                  (_, i) =>
                      new random.RandomString(
                          `${name}-ipv6-suffix-${i}`,
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

        const networkSettings: Partial<aws.ec2.SpotInstanceRequestArgs> &
            aws.ec2.NetworkInterfaceArgs = {
            subnetId: pulumi.output(args.subnetIds).apply((ids) => ids[0]),
            ...(args.network?.sourceDestCheck !== undefined
                ? {
                      sourceDestCheck: args.network?.sourceDestCheck,
                  }
                : {}),
            ...(args.network?.useENI
                ? { securityGroups: args.securityGroupIds }
                : { vpcSecurityGroupIds: args.securityGroupIds }),
            ...(privateIp ? { privateIps: [privateIp] } : {}),
            ...(privateIpv6 ? { ipv6Addresses: [privateIpv6] } : {}),
        }

        // create the nic explicitly here
        //   - SpotInstanceRequest doesn't do sourceDestCheck properly
        //   - routes persist after instance recreation
        const nic =
            !(args.offline ?? false) && args.network?.useENI
                ? new aws.ec2.NetworkInterface(
                      `${name}-interface`,
                      {
                          ...networkSettings,
                          tags: getTags({ Name: `${name}-interface` }),
                      },
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

        const arch = pulumi
            .output(args.instanceType)
            .apply((instanceType) =>
                aws.ec2.getInstanceType(
                    {
                        instanceType,
                    },
                    { parent: this },
                ),
            )
            .supportedArchitectures.apply((supported) => {
                if (supported.some((arch) => arch === 'arm64')) {
                    return 'arm64'
                }
                if (supported.some((arch) => arch === 'x86_64')) {
                    return 'x86_64'
                }
                throw new pulumi.ResourceError(
                    `Instance architecture(s) not supported: ${JSON.stringify(
                        supported,
                    )}`,
                    this,
                )
            })

        const kmsKeyId = pulumi.output(
            aws.kms.getKey({ keyId: 'alias/aws/ebs' }, { parent: this }),
        ).arn

        const sshHostKeys = args.sshHostKeys ?? {
            ...(() => {
                const ecdsa = new tls.PrivateKey(
                    `${name}-ssh-ecdsa`,
                    {
                        algorithm: 'ECDSA',
                        ecdsaCurve: 'P256',
                    },
                    { parent: this },
                )
                return pulumi
                    .all([ecdsa.publicKeyOpenssh, ecdsa.privateKeyPem])
                    .apply(
                        ([ecdsaPub, ecdsa]) =>
                            ({
                                ecdsaPub,
                                ecdsa,
                            } as SshHostKeys),
                    )
            })(),
        }

        // cloud-init creates unwanted keys, even when
        const deleteUnwantedKeys = pulumi
            .output(sshHostKeys)
            .apply((sshHostKeys) => {
                const types = ['rsa', 'dsa', 'ecdsa', 'ed25519']
                const unwantedTypes = types.filter(
                    (type) =>
                        !Object.keys(sshHostKeys).some((key) => key === type),
                )
                const unwantedFiles = [
                    ...unwantedTypes.map(
                        (type) => `/etc/ssh/ssh_host_${type}_key`,
                    ),
                    ...unwantedTypes.map(
                        (type) => `/etc/ssh/ssh_host_${type}_key.pub`,
                    ),
                ]
                return unwantedFiles
            })

        const instance =
            args.offline ?? false
                ? undefined
                : new aws.ec2.SpotInstanceRequest(
                      `${name}-instance`,
                      {
                          instanceType: args.instanceType,
                          ami:
                              args.amiId ??
                              getAmazonLinux2AmiId({ arch }, { parent: this }),
                          ...(args.instanceRoleId
                              ? {
                                    iamInstanceProfile:
                                        new aws.iam.InstanceProfile(
                                            `${name}-instance-profile`,
                                            {
                                                role: args.instanceRoleId,
                                            },
                                        ).id,
                                }
                              : {}),
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
                          keyName: 'bennett@MacBook Pro 16',
                          userData: makeCloudInitUserdata(
                              prependCmds(
                                  addHostKeys(
                                      pulumi
                                          .output(args.userData)
                                          .apply((argsUserData) => ({
                                              ...userData,
                                              ...(argsUserData ?? {}),
                                              write_files:
                                                  args.rebootForKernelUpdates ??
                                                  true
                                                      ? // reboot is enabled by default
                                                        [
                                                            ...userData.write_files,
                                                            ...((
                                                                argsUserData ??
                                                                {}
                                                            ).write_files ??
                                                                []),
                                                        ]
                                                      : // otherwise, disable reboot
                                                        [
                                                            ...userData.write_files.map(
                                                                (file) => ({
                                                                    ...file,
                                                                    content:
                                                                        file.path ===
                                                                        upgradeScriptPath
                                                                            ? upgrade
                                                                            : file.content,
                                                                }),
                                                            ),
                                                            ...((
                                                                argsUserData ??
                                                                {}
                                                            ).write_files ??
                                                                []),
                                                        ],
                                          })),
                                      sshHostKeys ?? {},
                                  ),
                                  deleteUnwantedKeys.apply((files) => [
                                      ...files.map(
                                          (file) => `rm -f '${file}' || true`,
                                      ),
                                      'systemctl reload sshd',
                                  ]),
                              ),
                          ),
                          rootBlockDevice: {
                              deleteOnTermination: true,
                              volumeSize: args.rootVolumeSize ?? 4,
                              volumeType: 'gp3',
                              encrypted: true,
                              kmsKeyId,
                          },
                          instanceInitiatedShutdownBehavior: 'stop',
                          spotType: 'persistent',
                          creditSpecification: {
                              cpuCredits: 'standard',
                          },
                          disableApiTermination: true,
                          instanceInterruptionBehavior: 'stop',
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
                          tags: getTags({ Name: `${name}-instance` }),
                          volumeTags: getTags({
                              Name: `${name}-instance-root`,
                              InstanceName: `${name}-instance`,
                          }),
                      },
                      {
                          parent: this,
                          ignoreChanges: ['validUntil'],
                          replaceOnChanges: [
                              ...(nic ? [] : ['privateIp']),
                              'tags',
                          ],
                          ...(nic ? { dependsOn: [nic] } : {}),
                          deleteBeforeReplace: true,
                      },
                  )

        // aws.ec2.SpotInstanceRequest doesn't propagate tags to the instance,
        // but we can do it ourselves
        if (instance !== undefined) {
            pulumi
                .all([instance.spotInstanceId, instance.tags])
                .apply(([instanceId, tags]) =>
                    Object.entries(tags ?? {}).map(
                        ([key, value]) =>
                            new aws.ec2.Tag(`${name}-instance-${key}`, {
                                resourceId: instanceId,
                                key,
                                value,
                            }),
                    ),
                )
        }

        this.interfaceId = nic?.id ?? instance?.primaryNetworkInterfaceId
        this.instanceId = instance?.spotInstanceId

        if (eip && instance) {
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
            this.ip = pulumi
                .all([instance?.publicIp, instance?.privateIp, privateIp])
                .apply(([publicIp, instancePrivateIp, privateIp]) =>
                    publicIp && publicIp !== ''
                        ? publicIp
                        : instancePrivateIp && instancePrivateIp !== ''
                        ? instancePrivateIp
                        : privateIp,
                )
        }

        this.publicIp = eip ? eip.publicIp : instance?.publicIp
        this.privateIp = nic ? nic.privateIp : instance?.privateIp ?? privateIp
        this.ipv6 = nic
            ? pulumi
                  .all([nic.ipv6Addresses])
                  .apply(([addresses]) => addresses.join(', '))
            : pulumi
                  .all([instance?.ipv6Addresses ?? [], privateIpv6])
                  .apply(([addresses, privateIpv6]) => {
                      if (addresses.length > 1) {
                          throw new pulumi.ResourceError(
                              'too many IPv6s!',
                              this,
                          )
                      }
                      if (addresses.length === 1) {
                          return addresses[0]
                      }
                      return privateIpv6
                  })

        if (args.dns?.zone) {
            const hostname =
                args.dns.hostname ??
                new random.RandomString(
                    `${name}-hostname`,
                    {
                        length: 8,
                        lower: true,
                        upper: false,
                        number: false,
                        special: false,
                    },
                    { parent: this },
                ).result

            const aaaa = this.ipv6
                ? new aws.route53.Record(
                      `${name}-aaaa`,
                      {
                          name: hostname,
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
                : undefined

            const a = this.ip
                ? new aws.route53.Record(
                      `${name}-a`,
                      {
                          name: hostname,
                          type: 'A',
                          zoneId: args.dns.zone,
                          ttl: 300,
                          records: [this.ip],
                      },
                      {
                          parent: this,
                          deleteBeforeReplace: true,
                      },
                  )
                : undefined

            this.hostname =
                aaaa || a
                    ? pulumi
                          .all([aaaa?.fqdn, a?.fqdn])
                          .apply(([aaaafqdn, afqdn]) => aaaafqdn ?? afqdn)
                    : undefined
        }

        if (args.notificationsTopicArn !== undefined) {
            const rule = this.instanceId
                ? new aws.cloudwatch.EventRule(
                      `${name}-ec2-events`,
                      {
                          eventPattern: pulumi
                              .output(this.instanceId)
                              .apply((instanceId) =>
                                  JSON.stringify({
                                      source: ['aws.ec2'],
                                      'detail-type': [
                                          'EC2 Instance State-change Notification',
                                          'EC2 Instance Rebalance Recommendation',
                                          'EC2 Spot Instance Interruption Warning',
                                      ],
                                      detail: {
                                          'instance-id': [instanceId],
                                      },
                                  }),
                              ),
                      },
                      { parent: this },
                  )
                : undefined

            if (rule) {
                new aws.cloudwatch.EventTarget(
                    `${name}-ec2-events`,
                    {
                        rule: rule.id,
                        arn: args.notificationsTopicArn,
                    },
                    { parent: this },
                )
            }
        }
    }
}

export type Arch = 'x86_64' | 'amd64' | 'arm64'

// https://aws.amazon.com/blogs/compute/query-for-the-latest-amazon-linux-ami-ids-using-aws-systems-manager-parameter-store/
export function getAmazonLinux2AmiId(
    args: {
        arch: Arch | pulumi.Input<Arch>
    },
    opts?: pulumi.InvokeOptions,
): pulumi.Output<string> {
    return pulumi.output(args?.arch).apply(
        async (arch) =>
            await aws.ssm
                .getParameter(
                    {
                        name: `/aws/service/ami-amazon-linux-latest/amzn2-ami-minimal-hvm-${
                            arch === 'amd64' ? 'x86_64' : arch
                        }-ebs`,
                    },
                    { ...opts, async: true },
                )
                .then((result) => result.value)
                .catch((reason) => {
                    pulumi.log.error(
                        `Error getting Amazon Linux 2 AMI ID: ${reason}`,
                    )
                    throw reason
                }),
    )
}

// https://ubuntu.com/server/docs/cloud-images/amazon-ec2
// Note that 'server-minimal' images are for arm64 only
export function getUbuntuAmi(
    args: {
        arch: Arch | pulumi.Input<Arch>
        product?:
            | 'server'
            | 'server-minimal'
            | pulumi.Input<'server' | 'server-minimal'>
        release?:
            | 'focal'
            | '20.04'
            | 'bionic'
            | '18.04'
            | 'xenial'
            | '16.04'
            | string
            | pulumi.Input<
                  | 'focal'
                  | '20.04'
                  | 'bionic'
                  | '18.04'
                  | 'xenial'
                  | '16.04'
                  | string
              >
        virtType?: 'pv' | 'hvm' | pulumi.Input<'pv' | 'hvm'>
        volType?: 'ebs-gp2' | 'ebs-io1' | 'ebs-standard' | 'instance-store'
    },
    opts?: pulumi.InvokeOptions,
) {
    return pulumi
        .all([
            args?.arch,
            args?.product,
            args?.release,
            args?.virtType,
            args?.volType,
        ])
        .apply(
            async ([arch, product, release, virtType, volType]) =>
                await aws.ssm
                    .getParameter(
                        {
                            name: `/aws/service/canonical/ubuntu/${
                                product ?? 'server'
                            }/${release ?? '20.04'}/stable/current/${
                                arch === 'x86_64' ? 'amd64' : arch
                            }/${virtType ?? 'hvm'}/${
                                volType ?? 'ebs-gp2'
                            }/ami-id`,
                        },
                        { ...opts, async: true },
                    )
                    .then((result) => result.value)
                    .catch((reason) => {
                        pulumi.log.error(
                            `Error getting Amazon Linux 2 AMI ID: ${reason}`,
                        )
                        throw reason
                    }),
        )
}
