import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

const config = new pulumi.Config('common')
const accountNumber = config.require<string>('aws-account-number')

/**
 * Creates a mail server for sending mail using Amazon SES.
 * Includes:
 *  - validate domain in SES
 *  - includes DKIM & SPF
 *  - custom FROM domains
 *  - SNS topics for bounces and complaints
 */
export class MailServer extends pulumi.ComponentResource {
    bounceTopic: aws.sns.Topic
    complaintTopic: aws.sns.Topic

    constructor(
        name: string,
        args: {
            /**
             * The domain from which mail is to be sent
             */
            domain: pulumi.Input<string>

            /**
             * A route53 zone id used to create the verification record for
             * the zone. If not specified, the module will attempt to look up
             * a Route53 zone for domain.
             */
            zoneId?: pulumi.Input<string>
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:mail-server/MailServer', name, {}, opts)

        const ses = new aws.ses.DomainIdentity(
            name,
            {
                domain: args.domain,
            },
            { parent: this },
        )

        const zoneId =
            args.zoneId ??
            pulumi.output(args.domain).apply((name) =>
                aws.route53.getZone(
                    {
                        name,
                    },
                    { parent: this },
                ),
            ).zoneId

        const verificationRecord = new aws.route53.Record(
            `${name}-verification`,
            {
                name: `_amazonses.${args.domain}`,
                type: 'TXT',
                zoneId,
                ttl: 300,
                records: [ses.verificationToken],
            },
            { parent: this },
        )

        const verified = new aws.ses.DomainIdentityVerification(
            name,
            {
                domain: args.domain,
            },
            { parent: this, dependsOn: verificationRecord },
        )

        const dkim = new aws.ses.DomainDkim(
            name,
            {
                domain: verified.domain,
            },
            { parent: this },
        )

        dkim.dkimTokens.apply((tokens) =>
            tokens.map(
                (token, idx) =>
                    new aws.route53.Record(
                        `${name}-dkim-${idx}`,
                        {
                            name: `${token}._domainkey`,
                            type: 'CNAME',
                            zoneId,
                            ttl: 300,
                            records: [`${token}.dkim.amazonses.com`],
                        },
                        { parent: this },
                    ),
            ),
        )

        pulumi.output(verified.domain).apply((domain) => {
            const mailFromDomain = `home.${domain}`

            const mailFrom = new aws.ses.MailFrom(
                name,
                {
                    domain: verified.domain,
                    mailFromDomain,
                    behaviorOnMxFailure: 'RejectMessage',
                },
                { parent: this },
            )

            new aws.route53.Record(
                `${name}-mx`,
                {
                    name: mailFrom.mailFromDomain,
                    type: 'MX',
                    zoneId,
                    ttl: 300,
                    records: ['10 feedback-smtp.ap-southeast-2.amazonses.com'],
                },
                { parent: this },
            )

            new aws.route53.Record(
                `${name}-spf`,
                {
                    name: mailFrom.mailFromDomain,
                    type: 'TXT',
                    zoneId,
                    ttl: 300,
                    records: ['v=spf1 include:amazonses.com -all'],
                },
                { parent: this },
            )
        })

        const policyTemplate = pulumi.output(ses.arn).apply((arn) => ({
            sid: 'AllowSES',
            principals: [
                { type: 'Service', identifiers: ['ses.amazonaws.com'] },
            ],
            actions: ['sns:Publish'],
            conditions: [
                {
                    test: 'StringEquals',
                    variable: 'AWS:SourceAccount',
                    values: [accountNumber],
                },
                {
                    test: 'StringEquals',
                    variable: 'AWS:SourceArn',
                    values: [arn],
                },
            ],
        }))

        this.bounceTopic = new aws.sns.Topic(
            `${name.replace(/\./g, '-')}-bounce`,
            {},
            { parent: this },
        )

        const bounceTopicPolicy = new aws.sns.TopicPolicy(
            `${name.replace(/\./g, '-')}-bounce`,
            {
                arn: this.bounceTopic.arn,
                policy: pulumi
                    .all([this.bounceTopic.arn, policyTemplate])
                    .apply(([arn, policyTemplate]) =>
                        aws.iam.getPolicyDocument(
                            {
                                statements: [
                                    {
                                        ...policyTemplate,
                                        resources: [arn],
                                    },
                                ],
                            },
                            { parent: this },
                        ),
                    ).json,
            },
            { parent: this },
        )

        this.complaintTopic = new aws.sns.Topic(
            `${name.replace(/\./g, '-')}-complaint`,
            {},
            { parent: this },
        )

        const complaintTopicPolicy = new aws.sns.TopicPolicy(
            `${name.replace(/\./g, '-')}-complaint`,
            {
                arn: this.complaintTopic.arn,
                policy: pulumi
                    .all([this.complaintTopic.arn, policyTemplate])
                    .apply(([arn, policyTemplate]) =>
                        aws.iam.getPolicyDocument(
                            {
                                statements: [
                                    {
                                        ...policyTemplate,
                                        resources: [arn],
                                    },
                                ],
                            },
                            { parent: this },
                        ),
                    ).json,
            },
            { parent: this },
        )

        new aws.ses.IdentityNotificationTopic(
            `${name.replace(/\./g, '-')}-bounce`,
            {
                identity: ses.arn,
                notificationType: 'Bounce',
                topicArn: this.bounceTopic.arn,
            },
            { parent: this, dependsOn: bounceTopicPolicy },
        )

        new aws.ses.IdentityNotificationTopic(
            `${name.replace(/\./g, '-')}-complaint`,
            {
                identity: ses.arn,
                notificationType: 'Complaint',
                topicArn: this.complaintTopic.arn,
            },
            { parent: this, dependsOn: complaintTopicPolicy },
        )
    }
}
