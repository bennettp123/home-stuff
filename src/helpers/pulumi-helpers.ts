import * as aws from '@pulumi/aws'
import * as pulumi from '@pulumi/pulumi'

/**
 * Before: { [name: string]: pulumi.Input<T> }
 * After: pulumi.Input<{ [name: string]: T }>
 */
export function packObject<T>(obj: { [name: string]: pulumi.Input<T> }) {
    const keys = Object.keys(obj)
    return pulumi
        .all(Object.values(obj))
        .apply((values) =>
            Object.fromEntries(keys.map((_, i) => [keys[i], values[i]])),
        )
}

/**
 * Before: pulumi.Input<T>[]
 * After: pulumi.Input<T[]>
 */
export function packArray<T>(arr: T[]) {
    return pulumi.all(arr)
}

export function makeAwsProvidersForRegions(
    name: string,
    args: {
        regions: aws.Region[]
        providerArgs?: aws.ProviderArgs
    },
    opts?: pulumi.CustomResourceOptions,
) {
    return args.regions.map((region) => ({
        region,
        provider: new aws.Provider(
            `${name}-${region}`,
            {
                ...(args.providerArgs ?? {}),
                region,
            },
            opts,
        ),
    }))
}
