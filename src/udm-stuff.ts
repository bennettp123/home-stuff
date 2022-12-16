import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from './helpers'
import { IamUser } from './lib/iam-user'

const certbotUser = new IamUser(
    'udm-certbot',
    {
        generateKeyPair: true,
        tags: getTags(),
    },
    {
        fromUser: [{ parent: pulumi.rootStackResource }],
    },
)

// allows UDM to generate a cert for pihole.home.bennettp123.com
// see https://go-acme.github.io/lego/dns/route53/#least-privilege-policy-for-production-purposes
new aws.iam.UserPolicy('udm-certbot', {
    user: certbotUser.user.id,
    policy: pulumi.output(
        aws.iam.getPolicyDocument({
            statements: [
                {
                    sid: 'GetChange',
                    effect: 'Allow',
                    actions: ['route53:GetChange'],
                    resources: ['arn:aws:route53:::change/*'],
                },
                {
                    sid: 'ListHostedZonesByName',
                    effect: 'Allow',
                    actions: ['route53:ListHostedZonesByName'],
                    resources: ['*'],
                },
                {
                    sid: 'ListResourceRecordSets',
                    effect: 'Allow',
                    actions: ['route53:ListResourceRecordSets'],
                    resources: ['arn:aws:route53:::hostedzone/Z1LNE5PQ9LO13V'],
                },
                {
                    sid: 'ChangeResourceRecordSets',
                    effect: 'Allow',
                    actions: ['route53:ChangeResourceRecordSets'],
                    resources: ['arn:aws:route53:::hostedzone/Z1LNE5PQ9LO13V'],
                    conditions: [
                        {
                            test: 'ForAllValues:StringEquals',
                            variable:
                                'route53:ChangeResourceRecordSetsNormalizedRecordNames',
                            values: [
                                '_acme-challenge.pihole.home.bennettp123.com',
                            ],
                        },
                        {
                            test: 'ForAllValues:StringEquals',
                            variable:
                                'route53:ChangeResourceRecordSetsRecordTypes',
                            values: ['TXT'],
                        },
                    ],
                },
            ],
        }),
    ).json,
})

export const udm = {
    certbot: {
        accessKeyId: pulumi.secret(certbotUser.accessKeyId),
        secretAccessKey: pulumi.secret(certbotUser.secretAccessKey),
    },
}
