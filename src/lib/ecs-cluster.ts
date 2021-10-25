import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'
import { getTags } from '../helpers'

export class Cluster extends pulumi.ComponentResource {
    arn: pulumi.Output<string>
    id: pulumi.Output<string>

    constructor(
        name: string,
        args: {},
        opts?: pulumi.ComponentResourceOptions,
    ) {
        super('bennettp123:ecs-cluster/Cluster', name, {}, opts)
        const cluster = new aws.ecs.Cluster(
            name,
            {
                capacityProviders: ['FARGATE_SPOT'],
                configuration: {},
                settings: [
                    {
                        name: 'containerInsights',
                        value: 'disabled',
                    },
                ],
                tags: getTags({ Name: name }),
            },
            { parent: this },
        )

        this.id = cluster.id
        this.arn = cluster.arn
    }
}
