import * as pulumi from '@pulumi/pulumi'
import { Instance, userData as defaultUserData } from './instance'

export const userData = `${defaultUserData}
packages:
  - openvpn
write_files:
  - path: /etc/cron.d/automatic-upgrades
    owner: root:root
    permissions: '0644'
    content: |
      0 * * * * root yum upgrade -y
  - path: /etc/openvpn/server.conf
    owner: root:root
    permissions: '0644'
    content: |
      ifconfig 192.168.127.2 192.168.127.1
      dev tun
      secret static.key
      keepalive 10 60
      ping-timer-rem
      persist-tun
      persist-key
      user nobody
      group nobody
      route 192.168.0.0 255.255.192.0
      route 192.168.128.0 255.255.192.0
      route 192.168.192.0 255.255.192.0
      port 1194
      remote 210.10.212.154 1194
  - path: /etc/openvpn/static.key
    owner: root:root
    permissions: '0600'
    content: |
      #
      # 2048 bit OpenVPN static key
      #
      -----BEGIN OpenVPN Static key V1-----
      57fdc295a505e7534bddafa12b0ae75a
      a122febd739207ebce55be21a0c0fffe
      0387b9cd47e71deea463611f579142a2
      7122a1ac04431c53340090d59d6491ab
      6dd39e7dbfd105c104dc6e962db8b9d0
      53c9929da34add07ccc9687ede6fec06
      b60a8c97bd125fe8a5b433daf2a78781
      6d7e3cf483538585b09dbc220f4e6fc7
      2f1843d6f7d969231703c937517a4857
      2725192af4022d2a3e5af0cd51f08a69
      ad16a4f7723423f92f5a46804793fe8a
      6c49ad8757f8903ed3595e92f935a78d
      66417df940206251bac03161d3d2a952
      086ba1f72fcddd2ff493f456dc866851
      800942fc78a4ee7bfeb045db8c4dec8d
      7fddaf48bfc98da3fd3782b00ee5093d
      -----END OpenVPN Static key V1-----
runcmd:
  - echo 1 > /proc/sys/net/ipv4/ip_forward
  - echo 1 > /proc/sys/net/ipv4/conf/eth0/proxy_arp
  - systemctl enable openvpn@server
  - systemctl start openvpn@server
`

/**
 * Jumpbox provides two things:
 *  - an SSH target to connect to remotely
 *  - an OpenVPN server that connects back to the unifi router at home
 */
export class JumpBox extends pulumi.ComponentResource {
    ip: pulumi.Output<string>
    ipv6: pulumi.Output<string>
    hostname?: pulumi.Output<string>
    instanceId: pulumi.Output<string>
    interfaceId: pulumi.Output<string>

    constructor(
        name: string,
        args: {
            publicSubnetIds: pulumi.Input<string[]>
            vpcId: pulumi.Input<string>
            securityGroups: pulumi.Input<string>[]
            dnsZone?: pulumi.Input<string>
            hostname?: pulumi.Input<string>
        },
        opts?: pulumi.CustomResourceOptions,
    ) {
        super('bennettp123:jumpbox/Jumpbox', name, args, opts)

        const instance = new Instance(
            name,
            {
                subnetIds: args.publicSubnetIds,
                vpcId: args.vpcId,
                securityGroupIds: args.securityGroups,
                userData,
                network: {
                    fixedIp: true,
                    useEIP: true,
                    fixedIpv6: true,
                    useENI: true,
                    sourceDestCheck: false,
                },
                ...(args.dnsZone && args.hostname
                    ? {
                          dns: {
                              zone: args.dnsZone,
                              hostname: args.hostname,
                          },
                      }
                    : {}),
            },
            { parent: this },
        )

        this.ip = instance.ip
        this.ipv6 = instance.ipv6
        this.hostname = instance.hostname
        this.instanceId = instance.instanceId
        this.interfaceId = instance.interfaceId
    }
}
