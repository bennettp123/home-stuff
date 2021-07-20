import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

export class DockerComposeIamRoles extends pulumi.ComponentResource {
    roleArn: pulumi.Output<string>

    constructor(
        name: string,
        _args: {},
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super(
            'bennettp123:docker-compose-on-ecs/DockerComposeIamRoles',
            name,
            {},
            opts,
        )

        // https://docs.docker.com/cloud/ecs-integration/#run-an-application-on-ecs
        const actions = [
            'application-autoscaling:*',
            'cloudformation:*',
            'ec2:AuthorizeSecurityGroupIngress',
            'ec2:CreateSecurityGroup',
            'ec2:CreateTags',
            'ec2:DeleteSecurityGroup',
            'ec2:DescribeRouteTables',
            'ec2:DescribeSecurityGroups',
            'ec2:DescribeSubnets',
            'ec2:DescribeVpcs',
            'ec2:RevokeSecurityGroupIngress',
            'ecs:CreateCluster',
            'ecs:CreateService',
            'ecs:DeleteCluster',
            'ecs:DeleteService',
            'ecs:DeregisterTaskDefinition',
            'ecs:DescribeClusters',
            'ecs:DescribeServices',
            'ecs:DescribeTasks',
            'ecs:ListAccountSettings',
            'ecs:ListTasks',
            'ecs:RegisterTaskDefinition',
            'ecs:UpdateService',
            'elasticloadbalancing:*',
            'iam:AttachRolePolicy',
            'iam:CreateRole',
            'iam:DeleteRole',
            'iam:DetachRolePolicy',
            'iam:PassRole',
            'logs:CreateLogGroup',
            'logs:DeleteLogGroup',
            'logs:DescribeLogGroups',
            'logs:FilterLogEvents',
            'route53:CreateHostedZone',
            'route53:DeleteHostedZone',
            'route53:GetHealthCheck',
            'route53:GetHostedZone',
            'route53:ListHostedZonesByName',
            'servicediscovery:*',

            // gpu support
            'ec2:DescribeVpcs',
            'autoscaling:*',
            'iam:CreateInstanceProfile',
            'iam:AddRoleToInstanceProfile',
            'iam:RemoveRoleFromInstanceProfile',
            'iam:DeleteInstanceProfile',
        ]

        const policy = new aws.iam.Policy(
            name,
            {
                policy: pulumi.output(
                    aws.iam.getPolicyDocument(
                        {
                            statements: [
                                {
                                    sid: 'AllowDockerCompose',
                                    actions,
                                    resources: ['*'],
                                },
                            ],
                        },
                        { parent: this },
                    ),
                ).json,
            },
            { parent: this },
        )

        const role = new aws.iam.Role(
            name,
            {
                assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
                    AWS: pulumi
                        .output(aws.getCallerIdentity())
                        .apply((i) => i.accountId),
                }),
            },
            { parent: this },
        )

        new aws.iam.RolePolicyAttachment(
            name,
            {
                role: role.name,
                policyArn: policy.arn,
            },
            { parent: this },
        )

        this.roleArn = role.arn
    }
}
