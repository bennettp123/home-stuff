import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import './dns-records'
import { getTags } from './helpers'
import { Chatbot } from './lib/chatbot'
import { CostAlerts } from './lib/cost-alerts'
import { DefaultRoutes } from './lib/default-routes'
import { Cluster } from './lib/ecs-cluster'
import { Gateway } from './lib/gateway'
import { Homebridge as HomebridgeEcs } from './lib/homebridge-ecs'
import { Instance } from './lib/instance'
import { MailServer } from './lib/mail-server'
import { MailUser } from './lib/mail-user'
import { DefaultNotifications, NotificationsTopic } from './lib/notifications'
import { Plex } from './lib/plex'
import { SecurityGroups } from './lib/security-groups'
import { SsmAutomations } from './lib/ssm-automations'
import { Vpc } from './lib/vpc'
import { providers } from './providers'
import './pulumi-state'
export { homebridge } from './homebridge-stuff'
export { udm } from './udm-stuff'

const config = new pulumi.Config('home-stuff')

const notifications = {
    'ap-southeast-2': new NotificationsTopic('ap-southeast-2', {}),
    'us-east-1': new NotificationsTopic(
        'us-east-1',
        {},
        { provider: providers['us-east-1'] },
    ),
    'us-east-2': new NotificationsTopic(
        'us-east-2',
        {},
        { provider: providers['us-east-2'] },
    ),
}

Object.entries(notifications).map(
    ([region, notificationsTopic]) =>
        new DefaultNotifications(
            region,
            {
                topicArn: notificationsTopic.topicArn,
            },
            {
                ...(region === 'default'
                    ? {}
                    : {
                          provider: providers[region],
                      }),
            },
        ),
)

new Chatbot('home', {
    topicArns: [...Object.values(notifications).map((topic) => topic.topicArn)],
})

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

const automations = new SsmAutomations('home', {}, {})

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
    notificationsTopicArn: notifications['ap-southeast-2'].topicArn,
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
    patchGroup: automations.patchGroup,
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
          notificationsTopicArn: notifications['ap-southeast-2'].topicArn,
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
          notificationsTopicArn: notifications['ap-southeast-2'].topicArn,
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
const sesIsEnabled = false

const ses = sesIsEnabled
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

new CostAlerts(
    'home',
    {
        subscriberArns: [notifications['us-east-1'].topicArn],
    },
    { provider: providers['us-east-1'] },
)
