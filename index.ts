import './src/pulumi-state'

import { JumpBox } from './src/jumpbox'
import { Vpc } from './src/vpc'
import { SecurityGroups } from './src/security-groups'

const {
    publicSubnetIds,
    vpcId,
} = new Vpc(
    'vpc',
    {
        cidrBlock: '192.168.64.0/18', // 192.168.60.0 to 192.168.127.255
        numberOfNatGateways: 0,
    }
)

const securityGroups = new SecurityGroups('security-groups', {
    vpcId,
})

const jumpbox = new JumpBox('home-jumpbox', {
    publicSubnetIds,
    vpcId,
    securityGroups: [
        securityGroups.jumpboxSecurityGroup.id,
        securityGroups.allowEgressToAllSecurityGroup.id,
        securityGroups.essentialIcmpSecurityGroup.id,
    ],
})

