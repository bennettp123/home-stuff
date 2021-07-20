import * as pulumi from '@pulumi/pulumi'
import { DockerComposeIamRoles } from './docker-compose-on-ecs'
import { Cluster } from './ecs-cluster'
import { Homebridge } from './homebridge'
import { JumpBox } from './jumpbox'
import { JumpBoxDefaultRoute } from './jumpbox-default-route'
import './pulumi-state'
import { SecurityGroups } from './security-groups'
import { Vpc } from './vpc'
import { VpcEndpoints } from './vpc-endpoints'

const config = new pulumi.Config('home-stuff')

const homeVpc = new Vpc('vpc', {
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

const securityGroups = new SecurityGroups('security-groups', {
    vpcId,
})

export const jumpbox = new JumpBox('home-jumpbox', {
    publicSubnetIds,
    vpcId,
    securityGroups: [
        securityGroups.jumpboxSecurityGroup.id,
        securityGroups.allowEgressToAllSecurityGroup.id,
        securityGroups.essentialIcmpSecurityGroup.id,
    ],
    hostname: 'j1.home.bennettp123.com',
    dnsZone: 'Z1LNE5PQ9LO13V',
})

new JumpBoxDefaultRoute('home-jumpbox', {
    vpc: homeVpc.vpc,
    interfaceId: jumpbox.interfaceId,
})

export const dockerComposeRole = new DockerComposeIamRoles('home', {})

export const cluster = config.getBoolean('enable-ecs')
    ? new Cluster('home', {})
    : null

if (config.getBoolean('enable-vpc-endpoints')) {
    pulumi.log.warn('VPC endpoints enabled. This has cost implications!')
    new VpcEndpoints('home', {
        vpcId,
        subnetIds: privateSubnetIds,
        securityGroupIds: [
            securityGroups.allowInboundWithinVpc.id,
            securityGroups.essentialIcmpSecurityGroup.id,
        ],
    })
}

if (config.getBoolean('enable-homebridge')) {
    if (!cluster) {
        throw new pulumi.RunError('homebridge requires an ECS cluster!')
    }

    if (!config.getBoolean('enable-vpc-endpoints')) {
        pulumi.log.warn('warning: homebridge needs VPC endpoints!')
    }

    new Homebridge('home', {
        clusterArn: cluster.arn,
        subnetIds: privateSubnetIds,
        securityGroupIds: [
            securityGroups.allowEgressToAllSecurityGroup.id,
            securityGroups.essentialIcmpSecurityGroup.id,
            securityGroups.allowInboundFromPrivate.id,
        ],
    })
}
