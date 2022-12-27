import * as unifi from '@pulumiverse/unifi'

const _default = new unifi.Network(
    'default',
    {
        name: 'default',
        purpose: 'corporate',
        site: 'default',
        igmpSnooping: true,
        domainName: 'default.home.bennettp123.com',

        subnet: '192.168.1.0/24',
        dhcpStart: '192.168.1.6',
        dhcpStop: '192.168.1.254',

        ipv6InterfaceType: 'static',
        ipv6StaticSubnet: '2404:bf40:e402:1::1/64',
        ipv6RaEnable: true,
        ipv6RaPriority: 'high',
        ipv6RaValidLifetime: 0,
    },
    {
        protect: true,
        deleteBeforeReplace: true,
    },
)

const dns = new unifi.Network(
    'dns',
    {
        name: 'dns',
        purpose: 'corporate',
        site: 'default',
        vlanId: 5,
        igmpSnooping: true,

        subnet: '192.168.5.0/24',
        dhcpEnabled: true,
        dhcpStart: '192.168.5.6',
        dhcpStop: '192.168.5.254',

        ipv6InterfaceType: 'static',
        ipv6StaticSubnet: '2404:bf40:e402:5::1/64',
        ipv6RaPriority: 'high',
        ipv6RaValidLifetime: 0,
        dhcpV6DnsAuto: false,
    },
    {
        protect: true,
        deleteBeforeReplace: true,
    },
)
