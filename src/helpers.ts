import * as pulumi from '@pulumi/pulumi'

export function getTags(overrides?: { [key: string]: string }): {
    [key: string]: string
} {
    return {
        Project: pulumi.getProject(),
        Stack: pulumi.getStack(),
        ManagedBy: 'pulumi',
        ...(overrides ?? {}),
    }
}
