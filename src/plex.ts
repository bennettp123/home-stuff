import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { addRepo, appendCmds, getTags } from './helpers'
import { Instance, InstanceArgs, userData as defaultUserData } from './instance'

const common = new pulumi.Config('common')
const accountNumber = common.require<string>('aws-account-number')

const config = new pulumi.Config('plex')

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
    }

    /**
     * An SNS topic for sending notifications
     */
    notificationsTopicArn: pulumi.Input<string>
}

export class Plex extends pulumi.ComponentResource {
    /**
     * The public IP address of the kodi instance.
     */
    ip: pulumi.Output<string>

    /**
     * The public IP address of the kodi instance.
     */
    publicIp: pulumi.Output<string>

    /**
     * The private IP address of the kodi instance.
     */
    privateIp: pulumi.Output<string>

    /**
     * The IPv6 address of the kodi instance.
     */
    ipv6: pulumi.Output<string>

    /**
     * The hostname of the kodi instance
     */
    hostname: pulumi.Output<string>

    constructor(
        name: string,
        args: PlexArgs,
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:plex/Plex', name, {}, opts)

        const bucket = new aws.s3.Bucket(
            `${name}-bucket`,
            {
                acl: 'private',
                serverSideEncryptionConfiguration: {
                    rule: {
                        bucketKeyEnabled: true,
                        applyServerSideEncryptionByDefault: {
                            sseAlgorithm: 'AES256',
                        },
                    },
                },
            },
            { parent: this, protect: true },
        )

        new aws.s3.BucketOwnershipControls(
            `${name}-bucket`,
            {
                bucket: bucket.id,
                rule: { objectOwnership: 'BucketOwnerPreferred' },
            },
            { parent: this },
        )

        new aws.s3.BucketPublicAccessBlock(
            `${name}-bucket`,
            {
                bucket: bucket.id,
                restrictPublicBuckets: true,
                blockPublicAcls: true,
                blockPublicPolicy: true,
                ignorePublicAcls: true,
            },
            { parent: this },
        )

        const userData = appendCmds(
            addRepo(
                bucket.id.apply((bucketId) => ({
                    ...defaultUserData,
                    packages: [
                        's3fs-fuse',
                        ...defaultUserData.packages,
                        'vim',
                        'plexmediaserver',
                    ],
                    disk_setup: {
                        ...((
                            defaultUserData as {
                                disk_setup?: { [key: string]: unknown }
                                [key: string]: unknown
                            }
                        ).disk_setup ?? {}),
                        '/dev/sdf': {
                            table_type: 'gpt',
                            layout: true,
                            overwrite: false,
                        },
                    },
                    fs_setup: [
                        ...((
                            defaultUserData as {
                                fs_setup?: [unknown]
                                [key: string]: unknown
                            }
                        ).fs_setup ?? []),
                        {
                            label: 'plexmediaserver',
                            filesystem: 'xfs',
                            device: '/dev/sdf',
                        },
                    ],
                    mounts: [
                        [
                            '/dev/sdf',
                            '/var/lib/plexmediaserver',
                            'xfs',
                            'defaults,noatime,nofail,nosuid,nodev',
                            '0',
                            '2',
                        ],
                    ],
                })),
                {
                    plex: {
                        name: 'PlexRepo',
                        baseurl:
                            'https://downloads.plex.tv/repo/rpm/$basearch/',
                        enabled: true,
                        gpgcheck: true,
                        gpgkey: 'https://downloads.plex.tv/plex-keys/PlexSign.key',
                    },
                },
            ),
            [
                'mkdir -p /opt/media',
                bucket.id.apply((bucketId) => {
                    // cloud-init can't mount this itself?!
                    const s3fs = [
                        `s3fs#${bucketId}`,
                        '/opt/media',
                        'fuse',
                        '_netdev,rw,nosuid,nodev,allow_other,nonempty,iam_role=auto,endpoint=ap-southeast-2,host=https://s3.dualstack.ap-southeast-2.amazonaws.com,user=plex',
                        '0',
                        '2',
                    ].join('   ')
                    return `grep -Fq "${s3fs}" /etc/fstab || echo "${s3fs}" >> /etc/fstab `
                }),
                // 'mount /opt/media', // fragile: you can mount an s3fs mountpoint multiple times?
                'while ! [ -e /dev/sdf ]; do sleep 1; done ' +
                    '&& rm -f /var/lib/cloud/instances/*/sem/config_disk_setup && cloud-init single -n disk_setup ' +
                    '&& rm -f /var/lib/cloud/instances/*/sem/config_mounts && cloud-init single -n mounts' +
                    '&& while ! mount | grep -s /var/lib/plexmediaserver; do sleep 1; done ' +
                    '&& chown -R plex:plex /var/lib/plexmediaserver ' +
                    '&& sudo systemctl restart plexmediaserver.service',
            ],
        )

        const role = new aws.iam.Role(
            `${name}-role`,
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(
                    aws.iam.Principals.Ec2Principal,
                ),
            },
            { parent: this },
        )

        new aws.s3.BucketPolicy(
            `${name}-bucket`,
            {
                bucket: bucket.id,
                policy: pulumi
                    .all([bucket.arn, role.arn])
                    .apply(([bucketArn, roleArn]) =>
                        aws.iam.getPolicyDocument({
                            version: '2012-10-17',
                            statements: [
                                {
                                    principals: [
                                        {
                                            type: 'AWS',
                                            identifiers: [
                                                `arn:aws:iam::${accountNumber}:root`,
                                                roleArn,
                                            ],
                                        },
                                    ],
                                    resources: [bucketArn, `${bucketArn}/*`],
                                    actions: ['s3:*'],
                                    effect: 'Allow',
                                },
                            ],
                        }),
                    ).json,
            },
            { parent: this },
        )

        const policy = new aws.iam.Policy(
            `${name}-policy`,
            {
                policy: pulumi.output(bucket.arn).apply((bucketArn) =>
                    aws.iam.getPolicyDocument({
                        version: '2012-10-17',
                        statements: [
                            {
                                sid: 'AllowBucketAccess',
                                resources: [bucketArn, `${bucketArn}:*`],
                                actions: ['s3:*'],
                                effect: 'Allow',
                            },
                            {
                                sid: 'AllowListHeadBuckets',
                                resources: ['*'],
                                actions: ['s3:ListBuckets'],
                                effect: 'Allow',
                            },
                        ],
                    }),
                ).json,
            },
            { parent: this },
        )

        new aws.iam.RolePolicyAttachment(
            `${name}-policy-attach`,
            {
                role: role.id,
                policyArn: policy.arn,
            },
            { parent: this },
        )

        const instance = new Instance(
            `${name}-server`,
            {
                subnetIds: pulumi
                    .output(args.subnet)
                    .apply((subnet) => subnet.id)
                    .apply((id) => [id]),
                instanceType: 't3.small',
                vpcId: args.vpcId,
                securityGroupIds: args.securityGroupIds,
                userData,
                network: {
                    fixedPrivateIp: true,
                    fixedIpv6: true,
                    useENI: false,
                    useEIP: false,
                },
                dns: args.dns,
                notificationsTopicArn: args.notificationsTopicArn,
                instanceRoleId: role.id,
                offline: desiredState === 'offline',
            },
            { parent: this },
        )

        const kmsKeyId = pulumi.output(
            aws.kms.getKey({ keyId: 'alias/aws/ebs' }, { parent: this }),
        ).arn

        const storage = new aws.ebs.Volume(
            `${name}-var-lib-plexmediaserver`,
            {
                type: 'gp3',
                size: 2,
                availabilityZone: pulumi
                    .output(args.subnet)
                    .apply((subnet) => subnet.availabilityZone),
                tags: getTags({ Name: `${name}-var` }),
                encrypted: true,
                kmsKeyId,
            },
            { parent: this, protect: true },
        )

        if (instance.instanceId) {
            new aws.ec2.VolumeAttachment(
                `${name}-var`,
                {
                    volumeId: storage.id,
                    instanceId: instance.instanceId,
                    deviceName: '/dev/sdf',
                },
                { parent: this },
            )
        }

        this.ip = instance.ip
        this.ipv6 = instance.ipv6!
        this.hostname = pulumi.output(instance.hostname).apply(
            (hostname) =>
                hostname ??
                (() => {
                    throw new pulumi.ResourceError(
                        'gateway hostname missing!',
                        this,
                    )
                })(),
        )
        this.publicIp = instance.publicIp!
        this.privateIp = instance.privateIp!
    }
}
