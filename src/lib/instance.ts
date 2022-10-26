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
} from '../helpers'

/*

TODOs:
 - The ENI-disabled code path is... not necessary. Remove it.
 - There's too many ways to override the default userdata. Simplify.
 - Currently designed around Amazon Linux 2, but the PlexBuntu class
   uses this -- including the userData stuff -- with ubuntu. Maybe
   the userData stuff belongs elsewhere.

*/

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

if which yum >/dev/null 2>&1; then
  # upgrade the things
  yum makecache -y
  yum upgrade -y
fi

if which apt-get >/dev/null 2>&1; then
  apt-get update
  apt-get dist-upgrade -y
fi
`

const upgradeAndReboot = `${upgrade}
# reboot if needed
if which needs-restarting >/dev/null 2>&1; then
  cloud-init status --wait --long
  needs-restarting -r || shutdown -r now

# needs-restarting is provided by yum-utils,
# ubuntu uses /var/run/reboot-required
elif [ -f /var/run/reboot-required ]; then
  cloud-init status --wait --long
  shutdown -r now
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
    runcmd: ['systemctl reload crond || systemctl restart cron || :'],
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
    userData?: pulumi.Input<{
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
    /**
     * if set, A and AAAA records will be created
     * with the hostname and zone specified
     */
    dns?: {
        zone: pulumi.Input<string>
        hostname?: pulumi.Input<string>
        preferPrivateIP?: boolean
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

    /**
     * The patch group for the instance
     */
    patchGroup?: pulumi.Input<string>

    /**
     * If set, a volume with this many gigabytes will be created and mounted
     * as a swap partition
     */
    swapGigs?: pulumi.Input<number>
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

    /**
     * The pulumi urn of the instance
     */
    instanceUrn?: pulumi.Output<string>

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
        const eip =
            args.network?.useEIP && !args.offline
                ? new aws.ec2.Eip(
                      `${name}-eip`,
                      { vpc: true, tags: getTags({ Name: `${name}-eip` }) },
                      { parent: this },
                  )
                : undefined

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

        // create the nic explicitly here
        //   - SpotInstanceRequest doesn't do sourceDestCheck properly
        //   - routes persist after instance recreation
        const nic =
            !(args.offline ?? false) && args.network?.useENI
                ? new aws.ec2.NetworkInterface(
                      `${name}-interface`,
                      {
                          subnetId: pulumi
                              .output(args.subnetIds)
                              .apply((ids) => ids[0]),
                          ...(args.network?.sourceDestCheck !== undefined
                              ? {
                                    sourceDestCheck:
                                        args.network?.sourceDestCheck,
                                }
                              : {}),
                          securityGroups: args.securityGroupIds,
                          ...(privateIp ? { privateIps: [privateIp] } : {}),
                          ...(privateIpv6
                              ? { ipv6Addresses: [privateIpv6] }
                              : {}),
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

        const imageId =
            args.amiId ?? getAmazonLinux2AmiId({ arch }, { parent: this })

        const ami = aws.ec2.Ami.get('selected', imageId, {}, { parent: this })
        const deviceName = ami.ebsBlockDevices.apply(
            (devices) => devices[0]?.deviceName ?? '/dev/xvda',
        )

        const instanceTags = {
            ...getTags({
                Name: `${name}-instance`,
            }),
            ...(args.patchGroup ? { PatchGroup: args.patchGroup } : {}),
        }

        const iamInstanceProfile = args.instanceRoleId
            ? new aws.iam.InstanceProfile(`${name}-instance-profile`, {
                  role: args.instanceRoleId,
              })
            : undefined

        const launchTemplate = new aws.ec2.LaunchTemplate(
            `${name}-template`,
            {
                updateDefaultVersion: true,
                instanceType: args.instanceType,
                instanceMarketOptions: {
                    marketType: 'spot',
                    spotOptions: {
                        instanceInterruptionBehavior: 'stop',
                        // if the spot request is interrupted, then persistent
                        // ensures the instance is re-launched.
                        spotInstanceType: 'persistent',
                    },
                },
                imageId,
                ...(iamInstanceProfile
                    ? {
                          iamInstanceProfile: {
                              name: iamInstanceProfile.name,
                          },
                      }
                    : {}),
                networkInterfaces: [
                    {
                        ...(nic
                            ? {
                                  deviceIndex: 0,
                                  networkInterfaceId: nic.id,
                              }
                            : {
                                  subnetId: pulumi
                                      .output(args.subnetIds)
                                      .apply((ids) => ids[0]),
                                  ...(args.network?.sourceDestCheck
                                      ? (() => {
                                            throw new pulumi.ResourceError(
                                                'Error: sourceDeskCheck requires useENI',
                                                this,
                                            )
                                        })()
                                      : {}),
                                  securityGroups: args.securityGroupIds,
                                  ...(privateIp
                                      ? { ipv4Addresses: [privateIp] }
                                      : {}),
                                  ...(privateIpv6
                                      ? { ipv6Addresses: [privateIpv6] }
                                      : {}),
                              }),
                    },
                ],
                keyName: 'bennett@MacBook Pro 16',
                userData: makeCloudInitUserdata(
                    prependCmds(
                        addHostKeys(
                            pulumi
                                .output(args.userData)
                                .apply((argsUserData) => ({
                                    ...userData,
                                    ...(argsUserData ?? {}),
                                    ...(() => {
                                        const bootcmd = [
                                            ...(argsUserData?.bootcmd ?? []),
                                            ...(args.swapGigs
                                                ? [
                                                      'mkswap /dev/xvdf',
                                                      'swapon /dev/xvdf',
                                                  ]
                                                : []),
                                        ]
                                        return bootcmd.length > 0
                                            ? { bootcmd }
                                            : {}
                                    })(),
                                    write_files:
                                        args.rebootForKernelUpdates ?? true
                                            ? // reboot is enabled by default
                                              [
                                                  ...userData.write_files,
                                                  ...((argsUserData ?? {})
                                                      .write_files ?? []),
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
                                                  ...((argsUserData ?? {})
                                                      .write_files ?? []),
                                              ],
                                })),
                            sshHostKeys ?? {},
                        ),
                        deleteUnwantedKeys.apply((files) => [
                            ...files.map((file) => `rm -f '${file}' || true`),
                            'systemctl reload sshd',
                        ]),
                    ),
                ).apply((str) => Buffer.from(str).toString('base64')),
                blockDeviceMappings: [
                    {
                        deviceName,
                        ebs: {
                            deleteOnTermination: 'true',
                            volumeSize: args.rootVolumeSize ?? 8,
                            volumeType: 'gp3',
                            encrypted: 'true',
                            kmsKeyId,
                        },
                    },
                    ...(args.swapGigs
                        ? [
                              {
                                  deviceName: '/dev/xvdf',
                                  ebs: {
                                      deleteOnTermination: 'true',
                                      volumeSize: args.swapGigs ?? 1,
                                      volumeType: 'gp3',
                                      encrypted: 'true',
                                      kmsKeyId,
                                  },
                              },
                          ]
                        : []),
                ],
                instanceInitiatedShutdownBehavior: 'stop',
                creditSpecification: {
                    cpuCredits: 'standard',
                },
                disableApiTermination: true,
                tagSpecifications: [
                    {
                        resourceType: 'instance',
                        tags: instanceTags,
                    },
                    {
                        resourceType: 'volume',
                        tags: getTags({
                            Name: `${name}-instance`,
                            InstanceName: `${name}-instance`,
                        }),
                    },
                    ...(nic
                        ? []
                        : [
                              {
                                  resourceType: 'network-interface',
                                  tags: getTags({
                                      Name: `${name}-instance`,
                                      InstanceName: `${name}-instance`,
                                  }),
                              },
                          ]),
                    {
                        resourceType: 'spot-instances-request',
                        tags: getTags({
                            Name: `${name}-instance`,
                            InstanceName: `${name}-instance`,
                        }),
                    },
                ],
            },
            { parent: this },
        )

        const instance =
            args.offline ?? false
                ? undefined
                : new aws.ec2.Instance(
                      `${name}-instance`,
                      {
                          launchTemplate: {
                              id: launchTemplate.id,
                              version: launchTemplate.latestVersion.apply(
                                  (version) => version.toString(),
                              ),
                          },
                          sourceDestCheck: args.network?.sourceDestCheck,
                          tags: instanceTags,
                          volumeTags: getTags({
                              Name: `${name}-instance`,
                              InstanceName: `${name}-instance`,
                          }),
                          iamInstanceProfile: iamInstanceProfile?.name,
                      },
                      {
                          parent: this,
                          replaceOnChanges: [...(nic ? [] : ['privateIp'])],
                          ...(nic ? { dependsOn: [nic] } : {}),
                          deleteBeforeReplace: true,
                      },
                  )

        if (instance !== undefined) {
            this.instanceUrn = instance.urn
        }

        this.interfaceId = nic?.id ?? instance?.primaryNetworkInterfaceId
        this.instanceId = instance?.id
        this.privateIp = nic ? nic.privateIp : instance?.privateIp ?? privateIp

        if (eip && instance) {
            this.ip = args.dns?.preferPrivateIP
                ? this.privateIp ?? eip.publicIp
                : eip.publicIp
        } else {
            this.ip = pulumi
                .all([instance?.publicIp, instance?.privateIp, privateIp])
                .apply(([publicIp, instancePrivateIp, privateIp]) =>
                    publicIp && publicIp !== '' && !args.dns?.preferPrivateIP
                        ? publicIp
                        : instancePrivateIp && instancePrivateIp !== ''
                        ? instancePrivateIp
                        : privateIp,
                )
        }

        this.publicIp = eip ? eip.publicIp : instance?.publicIp
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
                        name: `/aws/service/ami-amazon-linux-latest/amzn2-ami-kernel-5.10-hvm-${
                            arch === 'amd64' ? 'x86_64' : arch
                        }-gp2`,
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

// https://docs.aws.amazon.com/linux/al2022/ug/get-started.html
export function getAmazonLinux2022AmiId(
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
                        name: `/aws/service/ami-amazon-linux-latest/al2022-ami-minimal-kernel-5.10-${
                            arch === 'amd64' ? 'x86_64' : arch
                        }`,
                    },
                    { ...opts, async: true },
                )
                .then((result) => result.value)
                .catch((reason) => {
                    pulumi.log.error(
                        `Error getting Amazon Linux 2022 AMI ID: ${reason}`,
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
