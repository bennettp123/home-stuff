import * as pulumi from '@pulumi/pulumi'
import { DefaultRoutes } from './default-routes'
import { Cluster } from './ecs-cluster'
import { Gateway } from './gateway'
import { Homebridge as HomebridgeEcs } from './homebridge-ecs'
import { Instance } from './instance'
import './pulumi-state'
import { SecurityGroups } from './security-groups'
import { Vpc } from './vpc'

const config = new pulumi.Config('home-stuff')

const homeVpc = new Vpc('home', {
    cidrBlock: '192.168.64.0/18', // 192.168.60.0 to 192.168.127.255
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
