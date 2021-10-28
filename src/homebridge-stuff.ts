import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from './helpers'
import { IamUser } from './lib/iam-user'
import { homeIPv6s, homePublicIPv4s } from './lib/security-groups'

const common = new pulumi.Config('common')
const accountNumber = common.require<string>('aws-account-number')

// see also dns-records.ts

const certbotUser = new IamUser(
    'homebridge-certbot',
    {
        generateKeyPair: true,
        tags: getTags(),
    },
    {
        fromUser: [{ parent: pulumi.rootStackResource }],
    },
)

new aws.iam.UserPolicy('homebridge-certbot', {
    user: certbotUser.user.id,
    policy: pulumi.output(
        aws.iam.getPolicyDocument({
            statements: [
                {
                    sid: 'AllowRead',
                    effect: 'Allow',
                    actions: ['route53:ListHostedZones', 'route53:GetChange'],
                    resources: ['*'],
                },
                {
                    sid: 'AllowUpdate',
                    effect: 'Allow',
                    actions: ['route53:ChangeResourceRecordSets'],
                    resources: ['arn:aws:route53:::hostedzone/Z1LNE5PQ9LO13V'],
                },
            ],
        }),
    ).json,
})

const homeBridgeBackupUser = new IamUser('homebridge-backups', {
    generateKeyPair: true,
    tags: getTags(),
})

const homeBridgeBackupsBucket = new aws.s3.Bucket('homebridge-backups', {
    acl: 'private',
    serverSideEncryptionConfiguration: {
        rule: {
            applyServerSideEncryptionByDefault: {
                sseAlgorithm: 'AES256',
            },
        },
    },
    tags: getTags(),
})

new aws.s3.BucketPolicy('homebridge-backups', {
    bucket: homeBridgeBackupsBucket.bucket,
    policy: pulumi.output(homeBridgeBackupsBucket.arn).apply((resource) =>
        aws.iam.getPolicyDocument({
            statements: [
                {
                    sid: 'AllowIAM',
                    effect: 'Allow',
                    principals: [
                        {
                            type: 'AWS',
                            identifiers: [`arn:aws:iam::${accountNumber}:root`],
                        },
                    ],
                    actions: ['s3:*'],
                    resources: [resource, `${resource}/*`],
                },
            ],
        }),
    ).json,
})

new aws.s3.BucketOwnershipControls('homebridge-backups', {
    bucket: homeBridgeBackupsBucket.bucket,
    rule: {
        objectOwnership: 'BucketOwnerPreferred',
    },
})

new aws.s3.BucketPublicAccessBlock('homebridge-backups', {
    bucket: homeBridgeBackupsBucket.bucket,
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: true,
    restrictPublicBuckets: true,
})

new aws.iam.UserPolicy('homebridge-backups', {
    user: homeBridgeBackupUser.user.id,
    policy: pulumi.output(homeBridgeBackupsBucket.arn).apply((resource) =>
        aws.iam.getPolicyDocument({
            statements: [
                {
                    sid: 'AllowBackups',
                    effect: 'Allow',
                    actions: ['s3:*'],
                    resources: [`${resource}/*`],
                },
                {
                    sid: 'AllowListBucket',
                    effect: 'Allow',
                    actions: [
                        's3:ListBucket',
                        's3:ListBuckets',
                        's3:GetBucketLocation',
                    ],
                    resources: [resource],
                    conditions: [
                        {
                            test: 'IpAddress',
                            variable: 'aws:SourceIp',
                            values: [
                                ...new Set([
                                    ...homePublicIPv4s,
                                    ...homeIPv6s.map((ipv6) =>
                                        ipv6.toUpperCase(),
                                    ),
                                ]),
                            ],
                        },
                    ],
                },
            ],
        }),
    ).json,
})

export const homebridge = {
    backups: {
        accessKeyId: homeBridgeBackupUser.accessKeyId,
        secretAccessKey: homeBridgeBackupUser.secretAccessKey,
        bucket: homeBridgeBackupsBucket.bucket,
    },
    certbot: {
        accessKeyId: certbotUser.accessKeyId,
        secretAccessKey: certbotUser.secretAccessKey,
    },
}
