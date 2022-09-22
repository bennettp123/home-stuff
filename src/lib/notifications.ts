import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from '../helpers'

const config = new pulumi.Config('common')
const accountNumber = config.require<string>('aws-account-number')

export class DefaultNotifications extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            topicArn: pulumi.Input<string>
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:notifications/DefaultNotifications', name, {}, opts)

        const defaultRules = {
            acm: new aws.cloudwatch.EventRule(
                `${name}-acm`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.acm'],
                        'detail-type': [
                            'ACM Certificate Approaching Expiration',
                        ],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            health: new aws.cloudwatch.EventRule(
                `${name}-health`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.health'],
                        'detail-type': ['AWS Health Event'],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            kms: new aws.cloudwatch.EventRule(
                `${name}-kms`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.kms'],
                        'detail-type': [
                            'KMS Imported Key Material Expiration',
                            'KMS CMK Rotation',
                            'KMS CMK Deletion',
                        ],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            'savings-plans': new aws.cloudwatch.EventRule(
                `${name}-savings-plans`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.savingsplans'],
                        'detail-type': [
                            'Savings Plans State Change',
                            'Savings Plans State Change Alert',
                        ],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            'security-hub': new aws.cloudwatch.EventRule(
                `${name}-security-hub`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.securityhub'],
                        'detail-type': ['Security Hub Insight Results'],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            support: new aws.cloudwatch.EventRule(
                `${name}-support`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.support'],
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            'trusted-advisor': new aws.cloudwatch.EventRule(
                `${name}-trusted-advisor`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.trustedadvisor'],
                        'detail-type': [
                            'Trusted Advisor Check Item Refresh Notification',
                        ],
                        detail: {
                            status: ['ERROR', 'WARN'],
                        },
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
            'ssm-compliance': new aws.cloudwatch.EventRule(
                `${name}-ssm-compliance`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.ssm'],
                        'detail-type': [
                            'Configuration Compliance State Change',
                        ],
                        detail: {
                            'compliance-status': ['non_compliant', 'compliant'],
                        },
                    }),
                },
                pulumi.mergeOptions(opts, { parent: this }),
            ),
        }

        Object.entries(defaultRules).forEach(
            ([ruleName, rule]) =>
                new aws.cloudwatch.EventTarget(
                    `${name}-${ruleName}`,
                    {
                        rule: rule.id,
                        arn: args.topicArn,
                    },
                    pulumi.mergeOptions(opts, { parent: this }),
                ),
        )
    }
}

export class NotificationsTopic extends pulumi.ComponentResource {
    topicArn: pulumi.Output<string>

    constructor(
        name: string,
        args?: {},
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:notifications/NotificationsTopic', name, {}, opts)

        const makePolicyDoc = (topicArn: string) =>
            aws.iam.getPolicyDocument(
                {
                    version: '2008-10-17',
                    statements: [
                        {
                            sid: 'allow-managing-by-this-account',
                            effect: 'Allow',
                            principals: [
                                {
                                    type: 'AWS',
                                    identifiers: ['*'],
                                },
                            ],
                            actions: [
                                'SNS:Publish',
                                'SNS:RemovePermission',
                                'SNS:SetTopicAttributes',
                                'SNS:DeleteTopic',
                                'SNS:ListSubscriptionsByTopic',
                                'SNS:GetTopicAttributes',
                                'SNS:Receive',
                                'SNS:AddPermission',
                                'SNS:Subscribe',
                            ],
                            resources: [topicArn],
                            conditions: [
                                {
                                    test: 'StringEquals',
                                    variable: 'AWS:SourceOwner',
                                    values: [accountNumber],
                                },
                            ],
                        },
                        {
                            sid: 'allow-publishing-by-this-account-and-eventbridge',
                            effect: 'Allow',
                            principals: [
                                {
                                    type: 'AWS',
                                    identifiers: [
                                        `arn:aws:iam::${accountNumber}:root`,
                                    ],
                                },
                                {
                                    type: 'Service',
                                    identifiers: ['events.amazonaws.com'],
                                },
                            ],
                            actions: ['SNS:Publish'],
                            resources: [topicArn],
                        },
                        {
                            sid: 'allow-this-account-to-subscribe-and-recieve',
                            effect: 'Allow',
                            principals: [
                                {
                                    type: 'AWS',
                                    identifiers: [
                                        `arn:aws:iam::${accountNumber}:root`,
                                    ],
                                },
                            ],
                            actions: ['SNS:Subscribe', 'SNS:Receive'],
                            resources: [topicArn],
                        },
                    ],
                },
                pulumi.mergeOptions(opts, { parent: this }),
            )

        const topic = new aws.sns.Topic(
            `${name}-topic`,
            {
                // AWS Chatbot needs encryption disabled :(
                /*
                kmsMasterKeyId: pulumi.output(
                    aws.kms.getAlias(
                        { name: 'alias/aws/sns' },
                        { parent: this },
                    ),
                ).id,
                */
                tags: getTags({
                    Name: name,
                }),
            },
            pulumi.mergeOptions(opts, {
                parent: this,
            }),
        )

        const policy = new aws.sns.TopicPolicy(
            `${name}-topic-policy`,
            {
                arn: topic.arn,
                policy: topic.arn.apply((topicArn) => makePolicyDoc(topicArn))
                    .json,
            },
            pulumi.mergeOptions(opts, { parent: this }),
        )

        // wait for the policy to exist before exporting the topicArn
        this.topicArn = policy.arn.apply(() => topic.arn)
    }
}
