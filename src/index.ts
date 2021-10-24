import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { DefaultRoutes } from './default-routes'
import { Cluster } from './ecs-cluster'
import { Gateway } from './gateway'
import { getTags } from './helpers'
import { Homebridge as HomebridgeEcs } from './homebridge-ecs'
import { Instance } from './instance'
import { MailServer } from './mail-server'
import { MailUser } from './mail-user'
import { DefaultNotifications, NotificationsTopic } from './notifications'
import { Plex } from './plex'
import './pulumi-state'
import { SecurityGroups } from './security-groups'
import { Vpc } from './vpc'

const config = new pulumi.Config('home-stuff')

const providers = {
    'us-east-1': new aws.Provider('us-east-1', {
        region: 'us-east-1',
        profile: process.env.AWS_PROFILE,
    }),
}

const notifications = {
    default: new NotificationsTopic('ap-southeast-2', {
        workAroundSomeOldTerraformBug: 'ap-southeast-2',
    }),
    'us-east-1': new NotificationsTopic(
        'us-east-1',
        {
            workAroundSomeOldTerraformBug: 'us-east-1',
        },
        { provider: providers['us-east-1'] },
    ),
}

new DefaultNotifications('ap-southeast-2', {
    topicArn: notifications.default.topicArn,
})

new DefaultNotifications(
    'us-east-1',
    {
        topicArn: notifications['us-east-1'].topicArn,
    },
    { provider: providers['us-east-1'] },
)

const homeVpc = new Vpc('home', {
    cidrBlock: config.require<string>('vpc-cidr-block'),
    numberOfNatGateways: 0,
    numberOfAvailabilityZones: 3,
})

const {
    vpcId,
    vpcArn,
    publicSubnetIds,
    privateSubnetIds,
    ipv6PublicCidrs,
    cidrBlock,
} = homeVpc

export const vpc = {
    id: vpcId,
    arn: vpcArn,
    publicSubnetIds,
    privateSubnetIds,
    urn: homeVpc.urn,
    ipv6PublicCidrs,
    cidrBlock,
    privateSubnetCidrs: homeVpc.vpc.privateSubnets.then((s) =>
        s.map((s) => s.subnet.cidrBlock),
    ),
    publicSubnetCidrs: homeVpc.vpc.publicSubnets.then((s) =>
        s.map((s) => s.subnet.cidrBlock),
    ),
    isolatedSubnetCidrs: homeVpc.vpc.isolatedSubnets.then((s) =>
        s.map((s) => s.subnet.cidrBlock),
    ),
}

const securityGroups = new SecurityGroups('home', {
    vpcId,
})

const apSoutheast2c = {
    public: pulumi.output(homeVpc.vpc.publicSubnets).apply((publicSubnets) =>
        pulumi
            .all(
                publicSubnets.map((s) => ({
                    s,
                    az: s.subnet.availabilityZone,
                })),
            )
            .apply(
                (subnets) =>
                    subnets.filter((s) => s.az === 'ap-southeast-2c').pop() ??
                    (() => {
                        throw new pulumi.RunError(
                            'could not get public subnet in ap-southeast-2c',
                        )
                    })(),
            ),
    ).s.subnet,
    private: pulumi.output(homeVpc.vpc.privateSubnets).apply((privateSubnets) =>
        pulumi
            .all(
                privateSubnets.map((s) => ({
                    s,
                    az: s.subnet.availabilityZone,
                })),
            )
            .apply(
                (subnets) =>
                    subnets.filter((s) => s.az === 'ap-southeast-2c').pop() ??
                    (() => {
                        throw new pulumi.RunError(
                            'could not get public subnet in ap-southeast-2c',
                        )
                    })(),
            ),
    ).s.subnet,
    isolated: pulumi
        .output(homeVpc.vpc.isolatedSubnets)
        .apply((isolatedSubnets) =>
            pulumi
                .all(
                    isolatedSubnets.map((s) => ({
                        s,
                        az: s.subnet.availabilityZone,
                    })),
                )
                .apply(
                    (subnets) =>
                        subnets
                            .filter((s) => s.az === 'ap-southeast-2c')
                            .pop() ??
                        (() => {
                            throw new pulumi.RunError(
                                'could not get public subnet in ap-southeast-2c',
                            )
                        })(),
                ),
        ).s.subnet,
}

export const gateway = new Gateway('home-gateway', {
    subnetIds: apSoutheast2c.public.id.apply((id) => [id]),
    vpcId,
    securityGroupIds: [
        securityGroups.gatewaySecurityGroup.id,
        securityGroups.allowEgressToAllSecurityGroup.id,
        securityGroups.essentialIcmpSecurityGroup.id,
        securityGroups.allowSshFromTrustedSources.id,
    ],
    dns: {
        hostname: 'gw.home.bennettp123.com',
        zone: 'Z1LNE5PQ9LO13V',
    },
    natCidrs: [homeVpc.vpc.vpc.cidrBlock],
    notificationsTopicArn: notifications.default.topicArn,
    openvpn: {
        tunnel: {
            localAddress: config.require<string>(
                'openvpn-tunnel-address-local',
            ),
            remoteAddress: config.require<string>(
                'openvpn-tunnel-address-remote',
            ),
        },
        listenOnPort: config.getNumber('openvpn-listen-on-port', {
            min: 1,
            max: 65535,
        }),
        remote: {
            address: config.require<string>('home-public-ip'),
            port: config.getNumber('openvpn-remote-port', {
                min: 1,
                max: 65535,
            }),
        },
        routedCidrs: config.getObject<Array<string>>('home-cidr-blocks'),
    },
})

new DefaultRoutes('home-gateway', {
    vpc: homeVpc.vpc,
    interfaceId: gateway.interfaceId,
})

export const publicServer = config.getBoolean('enable-test-servers')
    ? new Instance('public-server', {
          subnetIds: publicSubnetIds,
          instanceType: 't4g.nano',
          vpcId,
          securityGroupIds: [
              securityGroups.allowEgressToAllSecurityGroup.id,
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
              securityGroups.allowSshFromTrustedSources.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
          },
          network: {
              fixedPrivateIp: true,
              fixedIpv6: true,
              useENI: true,
          },
      })
    : undefined

export const privateServer = config.getBoolean('enable-test-servers')
    ? new Instance('private-server', {
          subnetIds: privateSubnetIds,
          instanceType: 't4g.nano',
          vpcId,
          securityGroupIds: [
              securityGroups.allowEgressToAllSecurityGroup.id,
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
              securityGroups.allowSshFromTrustedSources.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
          },
          network: {
              fixedPrivateIp: true,
              fixedIpv6: true,
              useENI: true,
          },
      })
    : undefined

export const plex = config.getBoolean('enable-plex')
    ? new Plex('plex', {
          subnet: apSoutheast2c.public,
          vpcId,
          securityGroupIds: [
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
              securityGroups.allowSshFromTrustedSources.id,
              securityGroups.plexSecurityGroup.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
              hostname: 'plex.home.bennettp123.com',
              preferPrivateIP: true,
          },
          notificationsTopicArn: notifications.default.topicArn,
      })
    : undefined

// this is for "general stuff", certs etc
// TODO move to fargate?
export const automationServer = false
    ? new Instance('automations', {
          subnetIds: privateSubnetIds,
          instanceType: 't4g.nano',
          vpcId,
          securityGroupIds: [
              securityGroups.allowEgressToAllSecurityGroup.id,
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
              securityGroups.allowSshFromTrustedSources.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
              hostname: 'automations.home.bennettp123.com',
          },
          network: {
              fixedPrivateIp: true,
              fixedIpv6: true,
              useENI: true,
          },
          notificationsTopicArn: notifications.default.topicArn,
      })
    : undefined

// this is now a raspberry pi!
export const homeBridge = config.getBoolean('enable-homebridge')
    ? new Instance('homebridge', {
          subnetIds: privateSubnetIds,
          instanceType: 't4g.nano',
          vpcId,
          securityGroupIds: [
              securityGroups.allowEgressToAllSecurityGroup.id,
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
              securityGroups.allowSshFromTrustedSources.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
              preferPrivateIP: true,
          },
          network: {
              fixedPrivateIp: true,
              fixedIpv6: true,
              useENI: true,
          },
      })
    : undefined

new aws.route53.Record(
    'homebridge-aaaa',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'AAAA',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['2404:bf40:e402:33:ba27:ebff:fe2c:18d7'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-a',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'A',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: ['192.168.33.16'],
    },
    {
        deleteBeforeReplace: true,
    },
)

const certbotUser = new aws.iam.User('homebridge-certbot', {
    forceDestroy: true,
    tags: getTags(),
})

new aws.iam.UserPolicy('homebridge-certbot', {
    user: certbotUser.id,
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

const deleteme = new aws.iam.User('deleteme-certbot', {
    forceDestroy: true,
    tags: getTags(),
})

new aws.iam.UserPolicy('deleteme-certbot', {
    user: deleteme.id,
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

// note: using google mail instead
const ses = false
    ? new MailServer('home.bennettp123.com', {
          domain: 'home.bennettp123.com',
      })
    : undefined

export const mailServer = ses
    ? {
          ...ses.endpoint,
      }
    : undefined

export const epsonPrinterSmtpCreds = ses
    ? new MailUser('epson', {
          mailServer: ses,
      })
    : undefined

new aws.route53.Record(
    'home-mx',
    {
        name: 'home.bennettp123.com',
        type: 'MX',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            '1	ASPMX.L.GOOGLE.COM.',
            '5	ALT1.ASPMX.L.GOOGLE.COM.',
            '5	ALT2.ASPMX.L.GOOGLE.COM.',
            '10	ALT3.ASPMX.L.GOOGLE.COM.',
            '10	ALT4.ASPMX.L.GOOGLE.COM.',
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-mx',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'MX',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            '1	ASPMX.L.GOOGLE.COM.',
            '5	ALT1.ASPMX.L.GOOGLE.COM.',
            '5	ALT2.ASPMX.L.GOOGLE.COM.',
            '10	ALT3.ASPMX.L.GOOGLE.COM.',
            '10	ALT4.ASPMX.L.GOOGLE.COM.',
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'home-dkim',
    {
        name: 'google._domainkey.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            /**
             * See https://serverfault.com/a/954501
             *
             * A DNS record is made up of one or more parts, and the max size
             * of each part is 255 characters.
             *
             * Unfortunately neither terraform nor Route53 split up the parts,
             * so we have to do it ourselves.
             */
            (
                'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtS3YmDrHqPgVTWiA8SfCR+NIc2kMvLvSf31mTsrT3m1kGNnn+R7Fxecpl9gnsEiRDA/ElnCNoDJCyjdWzwKn0EcvzTdjvtAWk4pz6tmqK1+aQdRzrmzhYNeFP9biQWq51CmdTVXVB6p1Fr+STsG3/bTe+zubO4iLgNltGslBXEboTeeN6xsbA58ElJDGaG+Iwuw1Wcmia5qpZwKqDO7pSVD8ujBpksgutCSr6N3nBQM90wDQXONm8oAFz6OD/vbR5ljvk2WMuPlOHSWXa4oaP8WlbyGrYJpn1rXzkyiOuSd0wdl3TQ5sssSR0KJsxjzdqFmydhBe1Osyxs+GGeQwtwIDAQAB'.match(
                    /.{1,255}/g,
                ) ?? []
            )
                .map((entry) => entry ?? '')
                .join('" "'),
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'home-spf',
    {
        name: 'home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 3600,
        records: ['v=spf1 include:_spf.google.com ~all'],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-dkim',
    {
        name: 'google._domainkey.homebridge.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 300,
        records: [
            /**
             * See https://serverfault.com/a/954501
             *
             * A DNS record is made up of one or more parts, and the max size
             * of each part is 255 characters.
             *
             * Unfortunately neither terraform nor Route53 split up the parts,
             * so we have to do it ourselves.
             */
            (
                'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs/mHQw09RPT0UajBcbmCTztXOtqN2fN7zLk1HB0TAGNTg9+l60tyihnvJx/uzxChptfJkLS9A2+idFw7uD4IHzk0oPFId8j4ElJepdNLIEMS1DlBT//HsisNUF2IQbF/56wk/HWoogmKoyBmXCSluTEf4CP61L+zB/apgdsq80sPM+9Dsqk8EJTw6Fnx8ElR6L5AGyeNzyew7n0k2cDhlEkNGMdsM7pHflqOj0+45lStgFREUz+8JSE5OA3gX9kFC/fNRi0FTMYoAWUKhvfM2XTT7VTFrc/RCSb5eT5giqofhwRrwmVso26XKozulBaPWIKtnow1/3kWGEjG39kw7wIDAQAB'.match(
                    /.{1,255}/g,
                ) ?? []
            )
                .map((entry) => entry ?? '')
                .join('" "'),
        ],
    },
    {
        deleteBeforeReplace: true,
    },
)

new aws.route53.Record(
    'homebridge-spf',
    {
        name: 'homebridge.home.bennettp123.com',
        type: 'TXT',
        zoneId: 'Z1LNE5PQ9LO13V',
        ttl: 3600,
        records: ['v=spf1 include:_spf.google.com ~all'],
    },
    {
        deleteBeforeReplace: true,
    },
)

export const cluster = config.getBoolean('enable-ecs')
    ? new Cluster('home', {})
    : null

if (config.getBoolean('enable-homebridge-ecs')) {
    if (!cluster) {
        throw new pulumi.RunError('homebridge requires an ECS cluster!')
    }

    if (!config.getBoolean('enable-vpc-endpoints')) {
        pulumi.log.warn('warning: homebridge needs VPC endpoints!')
    }

    new HomebridgeEcs('home', {
        clusterArn: cluster.arn,
        subnetIds: privateSubnetIds,
        securityGroupIds: [
            securityGroups.allowEgressToAllSecurityGroup.id,
            securityGroups.essentialIcmpSecurityGroup.id,
            securityGroups.allowInboundFromPrivate.id,
            securityGroups.allowSshFromTrustedSources.id,
        ],
    })
}
