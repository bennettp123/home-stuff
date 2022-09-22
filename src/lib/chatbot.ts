import * as aws from '@pulumi/aws'
import * as awscc from '@pulumi/aws-native'
import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config('chatbot')

/**
 * Add a slack channel to an existing AWS Chatbot workspace.
 *
 * Note that the slack workspace needs to be set up manually -- this is
 * because Chatbot needs to be authorized in the Slack workspace -- see
 * https://docs.aws.amazon.com/chatbot/latest/adminguide/setting-up.html#Setup_intro
 * for setup details. There's no API available to automate this.
 */
export class Chatbot extends pulumi.ComponentResource {
    constructor(
        name: string,
        args?: {
            topicArns: pulumi.Input<pulumi.Input<string>[]>
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:chatbot/Chatbot', name, {}, opts)

        const slackWorkspaceId = config.get('slack-workspace-id')
        const slackChannelId = config.get('slack-channel-id')

        const role = new aws.iam.Role(
            `${name}-chatbot`,
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
                    Service: 'chatbot.amazonaws.com',
                }),
            },
            { parent: this },
        )

        const policies = [
            aws.iam.ManagedPolicy.ReadOnlyAccess,
            aws.iam.ManagedPolicy.AWSSupportAccess,
            'arn:aws:iam::aws:policy/AWSIncidentManagerResolverAccess',
            new aws.iam.Policy(
                `${name}-chatbot-readonly-commands`,
                {
                    policy: aws.iam.getPolicyDocumentOutput(
                        {
                            version: '2012-10-17',
                            statements: [
                                {
                                    effect: 'Deny',
                                    actions: [
                                        'iam:*',
                                        's3:GetBucketPolicy',
                                        'ssm:*',
                                        'sts:*',
                                        'kms:*',
                                        'cognito-idp:GetSigningCertificate',
                                        'ec2:GetPasswordData',
                                        'ecr:GetAuthorizationToken',
                                        'gamelift:RequestUploadCredentials',
                                        'gamelift:GetInstanceAccess',
                                        'lightsail:DownloadDefaultKeyPair',
                                        'lightsail:GetInstanceAccessDetails',
                                        'lightsail:GetKeyPair',
                                        'lightsail:GetKeyPairs',
                                        'redshift:GetClusterCredentials',
                                        'storagegateway:DescribeChapCredentials',
                                    ],
                                    resources: ['*'],
                                },
                            ],
                        },
                        { parent: this },
                    ).json,
                },
                { parent: this },
            ).arn,
            new aws.iam.Policy(
                `${name}-chatbot-notifications-only`,
                {
                    policy: aws.iam.getPolicyDocumentOutput(
                        {
                            version: '2012-10-17',
                            statements: [
                                {
                                    effect: 'Allow',
                                    actions: [
                                        'cloudwatch:Describe*',
                                        'cloudwatch:Get*',
                                        'cloudwatch:List*',
                                    ],
                                    resources: ['*'],
                                },
                            ],
                        },
                        { parent: this },
                    ).json,
                },
                { parent: this },
            ).arn,
            new aws.iam.Policy(
                `${name}-chatbot-invoke-lambda`,
                {
                    policy: aws.iam.getPolicyDocumentOutput(
                        {
                            version: '2012-10-17',
                            statements: [
                                {
                                    effect: 'Allow',
                                    actions: [
                                        'lambda:invokeAsync',
                                        'lambda:invokeFunction',
                                    ],
                                    resources: ['*'],
                                },
                            ],
                        },
                        { parent: this },
                    ).json,
                },
                { parent: this },
            ).arn,
        ]

        const attachments = policies.map(
            (policyArn, idx) =>
                new aws.iam.RolePolicyAttachment(
                    `${name}-chatbot-policy-${idx}`,
                    { role: role, policyArn },
                    { parent: this },
                ).id,
        )

        const iamRoleArn = pulumi.all(attachments).apply(() => role.arn)

        if (!slackWorkspaceId) {
            throw new pulumi.ResourceError('slack workspace not set', this)
        }

        if (!slackChannelId) {
            throw new pulumi.ResourceError('slack channel not set', this)
        }

        const defaultGuardrailPolicies = [
            aws.iam.ManagedPolicy.AdministratorAccess,
        ]

        new awscc.chatbot.SlackChannelConfiguration(
            `${name}-slack-notifications`,
            {
                configurationName: `${name}-slack-alerts`,
                slackWorkspaceId,
                slackChannelId,
                iamRoleArn,
                loggingLevel: 'INFO',
                userRoleRequired: false,
                guardrailPolicies: defaultGuardrailPolicies,
                snsTopicArns: pulumi
                    .output(args?.topicArns)
                    .apply((topicArns) => [...new Set(topicArns ?? [])]),
            },
            { parent: this },
        )
    }
}
