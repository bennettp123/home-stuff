import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { DefaultRoutes } from './default-routes'
import { Cluster } from './ecs-cluster'
import { Gateway } from './gateway'
import { Homebridge as HomebridgeEcs } from './homebridge-ecs'
import { Instance } from './instance'
import { Kodi } from './kodi'
import { DefaultNotifications, NotificationsTopic } from './notifications'
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
    numberOfAvailabilityZones: 1,
})

const { vpcId, vpcArn, publicSubnetIds, privateSubnetIds } = homeVpc

export const vpc = {
    id: vpcId,
    arn: vpcArn,
    publicSubnetIds,
    privateSubnetIds,
    urn: homeVpc.urn,
}

const securityGroups = new SecurityGroups('home', {
    vpcId,
})

export const gateway = new Gateway('home-gateway', {
    subnetIds: publicSubnetIds,
    vpcId,
    securityGroupIds: [
        securityGroups.gatewaySecurityGroup.id,
        securityGroups.allowEgressToAllSecurityGroup.id,
        securityGroups.essentialIcmpSecurityGroup.id,
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

export const kodi = config.getBoolean('enable-kodi-server')
    ? new Kodi('kodi', {
          subnetIds: privateSubnetIds,
          vpcId,
          securityGroupIds: [
              securityGroups.allowEgressToAllSecurityGroup.id,
              securityGroups.essentialIcmpSecurityGroup.id,
              securityGroups.allowInboundFromHome.id,
          ],
          dns: {
              zone: 'Z1LNE5PQ9LO13V',
              hostname: 'kodi.home.bennettp123.com',
          },
          notificationsTopicArn: notifications.default.topicArn,
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
        ],
    })
}
