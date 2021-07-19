import './pulumi-state'

import { JumpBox } from './jumpbox'
import { Vpc } from './vpc'
import { SecurityGroups } from './security-groups'
import { JumpBoxDefaultRoute } from './jumpbox-default-route'

const vpc = new Vpc(
    'vpc',
    {
        cidrBlock: '192.168.64.0/18', // 192.168.60.0 to 192.168.127.255
        numberOfNatGateways: 0,
        numberOfAvailabilityZones: 1,
    }
)

const {
    vpcId,
    publicSubnetIds,
} = vpc

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
    vpc: vpc.vpc,
    interfaceId: jumpbox.interfaceId,
})
