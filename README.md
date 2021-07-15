# home-stuff

Uses pulumi. AWS account: bennettp123

## quickstart

```
AWS_PROFILE=bennettp123 pulumi up
```

## more details

* There's only one stack, and it's called `home`.
* Creates a VPC, a jumpbox, and security groups for the jumpbox.
* Jumpbox has an IP whitelist, see `security-groups.ts`.

## known issues

* Preview shows that the `aws:ec2:EipAssociation` wants to be recreated, it thinks the allocationId has changed. It hasn't.
* There's no such thing as a static IPv6 in AWS, so if the box is recreated, its IPv6 changes.
* The private subnet has no access to the IPv4 internet. This is because I don't want to pay for an NAT gateways. Use IPv6 instead.
* The pulumi config contains its own state bucket and AWS key. Some find this confusing, but that's not my problem.
* Jumpbox is only available from Gabo Road (see whitelist). I suppose this should change.
