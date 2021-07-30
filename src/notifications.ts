import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from './helpers'

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
            health: new aws.cloudwatch.EventRule(
                `${name}-health`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.health'],
                        'detail-type': ['AWS Health Event'],
                    }),
                },
                { parent: this },
            ),
            kms: new aws.cloudwatch.EventRule(
                `${name}-kms`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.health'],
                        'detail-type': ['AWS Health Event'],
                    }),
                },
                { parent: this },
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
                { parent: this },
            ),
            'security-hub': new aws.cloudwatch.EventRule(
                `${name}-security-hub`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.securityhub'],
                        'detail-type': ['Security Hub Insight Results'],
                    }),
                },
                { parent: this },
            ),
            support: new aws.cloudwatch.EventRule(
                `${name}-support`,
                {
                    eventPattern: JSON.stringify({
                        source: ['aws.support'],
                    }),
                },
                { parent: this },
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
                { parent: this },
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
                    { parent: this },
                ),
        )
    }
}

export class NotificationsTopic extends pulumi.ComponentResource {
    topicArn: pulumi.Output<string>
    constructor(
        name: string,
        _args?: unknown,
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:notifications/NotificationsTopic', name, {}, opts)

        const accountNumber = aws
            .getCallerIdentity({ parent: this })
            .then((account) => account.accountId)

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
            { parent: this, ignoreChanges: ['policy'] },
        )

        const policy = new aws.sns.TopicPolicy(`${name}-topic-policy`, {
            arn: topic.arn,
            policy: topic.arn.apply(
                async (topicArn) =>
                    await accountNumber.then((accountNumber) =>
                        aws.iam
                            .getPolicyDocument({
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
                                                identifiers: [
                                                    'events.amazonaws.com',
                                                ],
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
                                        actions: [
                                            'SNS:Subscribe',
                                            'SNS:Receive',
                                        ],
                                        resources: [topicArn],
                                    },
                                ],
                            })
                            .then((p) => p.json),
                    ),
            ),
        })

        // wait for the policy to exist before exporting the topicArn
        this.topicArn = policy.arn.apply(() => topic.arn)
    }
}
