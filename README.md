# Home Stuff

A server environment where cost is the top priority.

Currently used by the author for home servers and stuff.

## Quickstart

```
pulumi login
pulumi up
```

## Goals

1. Infrastructure as code. Everything is automated.
2. Cost should be zero, or as close to zero as possible.
3. Availability isn't super-important, but everything must autoheal.
4. Minimalism. If the first three goals can't be met, it's better not to do it at all. Prefer simplicity.

## The VPC

The VPC has three different subnet types:

-   public -- instances are assigned a public IPv4 and IPv6 at launch
-   private -- instances are not assigned a public IPv4 at launch; outbound access only
-   isolated -- instances do not have outbound access to the public internet

Typically, on a private subnet, outbound IPv4 is routed through a NAT gateway. However, NAT gateways are expensive, so instead, the gateway instance routes IPv4 traffic to the public internet. IPv6 traffic is routed through an egress-only internet gateway, which has no cost.

The VPC operates within a single AZ. This has a few advantages:

-   data transfer rates are avoided between regions, since all data remains in one region
-   multiple regions aren't too useful without redundant VPN routers, which would add complexity to the routing tables
-   multiple regions aren't too useful without redundant app servers, and load balancers would add cost to each app

## The Gateway

The Gatway provides three functions:

1. An SSH jumpbox on the public internet.
2. An OpenVPN router that connects the home network to the internal VPC.
3. A NAT gateway instance for the private subnets.

## The VPN

A site-to-site VPN is created between the home network and the aws-vpc.

Each site has its own tunnel endpoint:

1. The unifi router at home (192.168.127.1)
2. The gateway in the vpc (192.168.127.2)

The CIDR 192.168.64.0/18 is assigned to the VPC. The unifi gateway creates a route for this automatically.

Routes are created in the VPC subnets for the remaining CIDRs:

-   192.168.0.0/18
-   192.168.128.0/18
-   192.168.192.0/18

The VPN type is OpenVPN, using a shared secret. This is somewhat limiting, but it's supported natively by the USG at home.

### The NAT gatway

AWS NAT gateways are expensive. So instead, the traffic is routed out through the gateway instead. Technically it's double-NAT.

### Key rotation

To rotate the shared secret:

```
# generate a new shared secret
openvpn --genkey --secret /dev/stdout
```

Then copy-and paste the shared secret into pulumi config:

```
pulumi config set gateway:openvpn-shared-secret --secret '<secret>'
pulumi up
```

Finally, the secret needs to be set in the unifi network settings, in the VPN settings, under `Pre-shared Secret Key`. You will probably need to remove whitespace, comments and newlines.

## Known issues

-   The private subnet has no access to the IPv4 internet. This is because I don't want to pay for an NAT gateways. However, traffic is routed through the gateway, so it should work, ableit slowly. IPv6 is unaffected.
-   The unifi gateway doesn't support IPv6 over VPN. This means that IPv4 access works fine.
-   The pulumi config contains its own state bucket and AWS key. Some find this confusing, but that's their problem.
-   Amazon Linux doesn't seem to support the "new" SSH private key format for RSA keys. The RSA private key should start with `-----BEGIN RSA PRIVATE KEY-----`
