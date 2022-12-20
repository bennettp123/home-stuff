import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { appendCmds, getTags } from '../helpers'
import {
    getUbuntuAmi,
    Instance,
    InstanceArgs,
    userData as defaultUserData,
} from './instance'

const config = new pulumi.Config('plex')

/**
 * Mount a wasabi bucket in addition to the S3 bucket.
 */
const wasabiBucket = config.get<string>('wasabi-bucket')

/**
 * Access key for connecting to wasabi-bucket
 * Format: `${accessKey}:${secret}` or `${bucket}:${accessKey}:${secret}`
 */
const wasabiCreds = config
    .getSecret<string>('wasabi-creds')
    ?.apply((creds) =>
        creds.startsWith(wasabiBucket ? `${wasabiBucket}:` : '')
            ? creds
            : `${wasabiBucket ? `${wasabiBucket}:` : ''}${creds}`,
    )

/**
 * The URL to use when connecting to wasabi. The default is to use us-east-1.
 * See https://wasabi-support.zendesk.com/hc/en-us/articles/360015106031-What-are-the-service-URLs-for-Wasabi-s-different-storage-regions-
 * for valid URLs.
 */
const wasabiUrl =
    config.get<string>('wasabi-url') ?? 's3.us-west-1.wasabisys.com'

/**
 * Override the instance type.
 */
const instanceType = config.get<string>('instance-type') || 't3a.micro'

/**
 * Override the size of the PMS volume
 */
const plexVolumeSize = config.getNumber('plex-volume-size-gb') || 8

/**
 * offline: plex server is switched off, but EBS/S3 resources are kept online
 * online: plex server is online
 */
const desiredState = config.get<'offline' | 'online'>('state') ?? 'offline'

export interface PlexArgs extends Partial<InstanceArgs> {
    /**
     * The underlying instance will be added to this subnet
     */
    subnet: pulumi.Input<aws.ec2.Subnet>

    /**
     * The instance will be added to the VPC with this ID
     */
    vpcId: pulumi.Input<string>

    /**
     * Security groups with these IDs will be applied to the kodi interface
     */
    securityGroupIds: pulumi.Input<string>[]

    /**
     * DNS settings for the kodi instance
     */
    dns: {
        /**
         * Create DNS records (A and AAAA) for the instance in this Route53
         * hosted zone
         */
        zone: pulumi.Input<string>

        /**
         * The hostname for the DNS records. Can be relative to the parent
         * zone, or fully-qualified.
         *
         * For example, if the parent zone is example.com, then the following
         * hostnames will produce the same records:
         *   - myhost.example.com
         *   - myhost
         */
        hostname: pulumi.Input<string>

        /**
         * If true, the A record will use the private IP, even if the instance
         * has a public IP.
         */
        preferPrivateIP?: boolean
    }

    /**
     * An SNS topic for sending notifications
     */
    notificationsTopicArn: pulumi.Input<string>
}

export class Plex extends pulumi.ComponentResource {
    /**
     * The public IP address of the plex instance.
     */
    ip?: pulumi.Output<string>

    /**
     * The public IP address of the plex instance.
     */
    publicIp?: pulumi.Output<string>

    /**
     * The private IP address of the plex instance.
     */
    privateIp?: pulumi.Output<string>

    /**
     * The IPv6 address of the plex instance.
     */
    ipv6?: pulumi.Output<string>

    /**
     * The hostname of the plex instance
     */
    hostname?: pulumi.Output<string>

    /**
     * The pulumi urn of the plex instance
     */
    instanceUrn?: pulumi.Output<string>

    constructor(
        name: string,
        args: PlexArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:plex/Plex', name, {}, opts)

        if (wasabiBucket && (!wasabiUrl || wasabiUrl === '')) {
            pulumi.log.warn(
                'wasabi-url not provided -- the default url is for us-east-1 only. ' +
                    `If wasabi bucket ${wasabiBucket} is not in us-east-1, then ` +
                    'mounting will fail. ' +
                    'Set wasabi-url to suppress this warning. ',
                this,
            )
        }

        wasabiCreds?.apply((creds) => {
            if (creds && creds !== '') {
                return creds
            }
            if (
                (!creds || creds === '') &&
                wasabiBucket &&
                wasabiBucket !== ''
            ) {
                throw new pulumi.RunError('wasabi-bucket needs wasabi-creds!')
            }
            return creds
        })

        const kmsKeyId = pulumi.output(
            aws.kms.getKey({ keyId: 'alias/aws/ebs' }, { parent: this }),
        ).arn

        const storage = new aws.ebs.Volume(
            `${name}-var-lib-plexmediaserver`,
            {
                type: 'gp3',
                size: plexVolumeSize,
                snapshotId: 'snap-0fa0da7e793226d71',
                availabilityZone: pulumi
                    .output(args.subnet)
                    .apply((subnet) => subnet.availabilityZone),
                tags: getTags({ Name: `${name}-var-lib-plexmediaserver` }),
                encrypted: true,
                kmsKeyId,
            },
            { parent: this, protect: true },
        )

        const cache = new aws.ebs.Volume(
            `${name}-var-cache-s3fs`,
            {
                type: 'gp3',
                size: 4,
                availabilityZone: pulumi
                    .output(args.subnet)
                    .apply((subnet) => subnet.availabilityZone),
                tags: getTags({ Name: `${name}-var-cache-s3fs` }),
                encrypted: true,
                kmsKeyId,
            },
            { parent: this },
        )

        const userData = appendCmds(
            pulumi
                .all([storage.id, cache.id])
                .apply(([plexVolumeId, cacheVolumeId]) => [
                    plexVolumeId.replace('-', ''),
                    cacheVolumeId.replace('-', ''),
                ])
                .apply(([plexVolumeId, cacheVolumeId]) => {
                    const plexDevice: string = `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${plexVolumeId}`
                    const cacheDevice: string = `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${cacheVolumeId}`
                    return {
                        ...defaultUserData,
                        timezone: 'Australia/Perth',
                        package_update: true,
                        package_upgrade: true,
                        apt: {
                            sources: {
                                plexmediaserver: {
                                    source: 'deb https://downloads.plex.tv/repo/deb public main',
                                    keyid: '97203C7B3ADCA79D',
                                },
                            },
                        },
                        yum_repos: undefined,
                        packages: [
                            'nvme-cli',
                            's3fs',
                            'jq',
                            'bind9-utils',
                            'traceroute',
                            'vim',
                            'plexmediaserver',
                        ],
                        write_files: [
                            ...(defaultUserData.write_files ?? []),
                            {
                                path: '/etc/passwd-s3fs',
                                owner: 'root:root',
                                permissions: '0600',
                                content: wasabiCreds,
                            },
                            {
                                path: '/etc/cron.hourly/clean-up-s3fs-cache',
                                owner: 'root:root',
                                permissions: '0755',
                                content: `#!/bin/bash

                                CACHE_DIR="/var/cache/s3fs/${wasabiBucket?.replace(
                                    '/',
                                    '\\/',
                                )}"
                                ENSURE_FREE=$(( 1 * 1024 * 1024 )) # 1GB

                                for file in \`find  -type f | xargs ls -ut1 | tac\`; do
                                  if [ "$(df --output=avail "$CACHE_DIR" | tail -n1)" -gt "$ENSURE_FREE" ]; then
                                    echo done
                                    exit 0
                                  else
                                    echo "deleting $file"
                                    rm "$file"
                                  fi
                                done
                                `,
                            },
                        ],
                        disk_setup: Object.fromEntries([
                            ...Object.entries(
                                (
                                    defaultUserData as {
                                        disk_setup?: { [key: string]: unknown }
                                        [key: string]: unknown
                                    }
                                ).disk_setup ?? {},
                            ),
                            [
                                plexDevice,
                                {
                                    table_type: 'gpt',
                                    layout: true,
                                    overwrite: false,
                                },
                                cacheDevice,
                                {
                                    table_type: 'gpt',
                                    layout: true,
                                    overwrite: false,
                                },
                            ],
                        ]),
                        fs_setup: [
                            ...((
                                defaultUserData as {
                                    fs_setup?: [unknown]
                                    [key: string]: unknown
                                }
                            ).fs_setup ?? []),
                            {
                                label: '_var_lib_plexmed',
                                filesystem: 'ext4',
                                device: plexDevice,
                            },
                            {
                                label: '_var_cache_s3fs',
                                filesystem: 'ext4',
                                device: cacheDevice,
                            },
                        ],
                        mounts: [
                            [
                                'LABEL=_var_lib_plexmed',
                                '/var/lib/plexmediaserver',
                                'ext4',
                                'defaults,noatime,nofail,nosuid,nodev',
                                '0',
                                '2',
                            ],
                            [
                                'LABEL=_var_cache_s3fs',
                                '/var/cache/s3fs',
                                'ext4',
                                'defaults,atime,nofail,nosuid,nodev',
                                '0',
                                '2',
                            ],
                        ],
                    }
                }),
            [
                ...(wasabiBucket
                    ? [
                          'mkdir -p /opt/media-wasabi',
                          (() => {
                              const s3fs = [
                                  wasabiBucket,
                                  '/opt/media-wasabi',
                                  'fuse.s3fs',
                                  `_netdev,rw,nosuid,nodev,allow_other,user=plex${
                                      wasabiUrl ? `,url=${wasabiUrl}` : ''
                                  },use_cache=/var/cache/s3fs`,
                                  '0',
                                  '2',
                              ].join('    ')
                              return `grep -Fq "${s3fs}" /etc/fstab || echo "${s3fs}" >> /etc/fstab `
                          })(),
                      ]
                    : []),
                pulumi
                    .all([storage.id, cache.id])
                    .apply(([plexVolumeId, cacheVolumeId]) => [
                        plexVolumeId.replace('-', ''),
                        cacheVolumeId.replace('-', ''),
                    ])
                    .apply(([plexVolumeId, cacheVolumeId]) => {
                        const plexDevice = `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${plexVolumeId}-part1`
                        const cacheDevice = `/dev/disk/by-id/nvme-Amazon_Elastic_Block_Store_${cacheVolumeId}-part1`
                        return (
                            'systemctl stop plexmediaserver.service' +
                            `&& while ! [ -e '${plexDevice}' ]; do sleep 1; done ` +
                            `&& while ! [ -e '${cacheDevice}' ]; do sleep 1; done ` +
                            '&& rm -f /var/lib/cloud/instances/*/sem/config_disk_setup && cloud-init single -n disk_setup ' +
                            '&& rm -f /var/lib/cloud/instances/*/sem/config_mounts && cloud-init single -n mounts' +
                            '&& while ! mount | grep -s /var/lib/plexmediaserver; do sleep 1; done ' +
                            '&& chown -R plex:plex /var/lib/plexmediaserver ' +
                            '&& while ! mount | grep -s /var/cache/s3fs; do sleep 1; done ' +
                            '&& mount -a || true' +
                            '&& systemctl start plexmediaserver.service'
                        )
                    }),
            ],
        )

        const instance = new Instance(
            `${name}-server`,
            {
                amiId: getUbuntuAmi(
                    {
                        arch: 'arm64',
                    },
                    { parent: this },
                ),
                subnetIds: pulumi
                    .output(args.subnet)
                    .apply((subnet) => subnet.id)
                    .apply((id) => [id]),
                instanceType,
                vpcId: args.vpcId,
                securityGroupIds: args.securityGroupIds,
                userData,
                network: {
                    fixedPrivateIp: true,
                    fixedIpv6: true,
                    useENI: true,
                    useEIP: true,
                },
                dns: args.dns,
                notificationsTopicArn: args.notificationsTopicArn,
                offline: desiredState === 'offline',
                rootVolumeSize: 8,
            },
            { parent: this },
        )

        if (instance.instanceId) {
            new aws.ec2.VolumeAttachment(
                `${name}-var-lib-plexmediaserver`,
                {
                    volumeId: storage.id,
                    instanceId: instance.instanceId,
                    deviceName: '/dev/sdf',
                },
                { parent: this },
            )
        }

        if (instance.instanceId) {
            new aws.ec2.VolumeAttachment(
                `${name}-var-cache-s3fs`,
                {
                    volumeId: cache.id,
                    instanceId: instance.instanceId,
                    deviceName: '/dev/sdg',
                },
                { parent: this },
            )
        }

        this.ip = instance.ip
        this.ipv6 = instance.ipv6
        this.hostname = instance.hostname
        this.publicIp = instance.publicIp
        this.privateIp = instance.privateIp
        this.instanceUrn = instance.instanceUrn
    }
}
