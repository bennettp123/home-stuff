import * as aws from '@pulumi/aws'
import * as awsx from '@pulumi/awsx'
import * as docker from '@pulumi/docker'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from '../helpers'

export class Homebridge extends pulumi.ComponentResource {
    constructor(
        name: string,
        args: {
            clusterArn: pulumi.Input<string>
            subnetIds: pulumi.Input<string[]>
            securityGroupIds: pulumi.Input<string>[]
        },
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:homebridge/Homebridge', name, {}, opts)

        const repo = new awsx.ecr.Repository(
            name,
            {
                lifeCyclePolicyArgs: {
                    rules: [
                        {
                            selection: 'untagged',
                            maximumAgeLimit: 7,
                        },
                        {
                            selection: 'any',
                            maximumNumberOfImages: 20,
                        },
                    ],
                },
                tags: getTags({ Name: name }),
            },
            { parent: this },
        )

        const upstream = docker.getRegistryImage({
            name: 'oznu/homebridge:latest',
        })

        const upstreamRemoteImage = new docker.RemoteImage(name, {
            name: upstream.then(
                (upstream) =>
                    upstream.name ??
                    (() => {
                        throw new pulumi.ResourceError(
                            'fetched an unnamed image',
                            this,
                        )
                    })(),
            ),
            pullTriggers: [upstream.then((upstream) => upstream.sha256Digest)],
        })

        const image = repo.buildAndPushImage({
            context: './dummy-docker-image',
            args: {
                SOURCE_IMAGE: upstreamRemoteImage.name,
            },
        })

        const task = new aws.ecs.TaskDefinition(
            `${name}-homebridge`,
            {
                containerDefinitions: pulumi.output(image).apply((image) =>
                    JSON.stringify([
                        {
                            name: `${name}-homebridge`,
                            image,
                            essential: true,
                            stopTimeout: 10,
                            portMappings: [
                                {
                                    containerPort: 8581,
                                },
                            ],
                            environment: [
                                {
                                    name: 'PGID',
                                    value: '1000',
                                },
                                {
                                    name: 'PUID',
                                    value: '1000',
                                },
                                {
                                    name: 'HOMEBRIDGE_CONFIG_UI',
                                    value: '1',
                                },
                                {
                                    name: 'HOMEBRIDGE_CONFIG_UI_PORT',
                                    value: '8581',
                                },
                                {
                                    name: 'TZ',
                                    value: 'Perth/Australia',
                                },
                            ],
                        },
                    ]),
                ),
                family: `${name}-homebridge`,
                cpu: '1024',
                memory: '2048',
                networkMode: 'awsvpc',
                requiresCompatibilities: ['FARGATE'],
                executionRoleArn: new aws.iam.Role(
                    `${name}-ecsTaskExecutionRole`,
                    {
                        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(
                            aws.iam.Principals.EcsTasksPrincipal,
                        ),
                        managedPolicyArns: [
                            aws.iam.ManagedPolicy
                                .AmazonECSTaskExecutionRolePolicy,
                        ],
                        tags: getTags({ Name: `${name}-ecsTaskExecutionRole` }),
                    },
                    { parent: this },
                ).arn,
            },
            { parent: this },
        )

        new aws.ecs.Service(
            `${name}-homebridge`,
            {
                cluster: args.clusterArn,
                taskDefinition: task.arn,
                deploymentController: {
                    type: 'ECS',
                },
                deploymentCircuitBreaker: {
                    enable: true,
                    rollback: true,
                },
                capacityProviderStrategies: [
                    {
                        capacityProvider: 'FARGATE_SPOT',
                        weight: 100,
                    },
                ],
                desiredCount: 1,
                networkConfiguration: {
                    subnets: args.subnetIds,
                    securityGroups: args.securityGroupIds,
                },
                tags: getTags({ Name: `${name}-homebridge` }),
            },
            { parent: this },
        )
    }
}
