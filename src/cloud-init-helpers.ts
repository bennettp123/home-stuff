import * as pulumi from '@pulumi/pulumi'

export function makeCloudInitUserdata(
    o: pulumi.Input<{}>,
): pulumi.Output<string> {
    return pulumi.interpolate`#cloud-config
${JSON.stringify(o)}
`
}

export function addCmds(
    o: pulumi.Input<
        {} & { runcmd: pulumi.Input<string>[] | pulumi.Input<string[]> }
    >,
    cmds: pulumi.Input<string[]> | pulumi.Input<string>[],
) {
    return pulumi
        .all([o, cmds])
        .apply(([o, cmds]) => (o.runcmd = [...(o.runcmd ?? []), ...cmds]))
}

export function addCmd(
    o: pulumi.Input<
        {} & { runcmd: pulumi.Input<string>[] | pulumi.Input<string[]> }
    >,
    cmd: pulumi.Input<string>,
) {
    return addCmds(
        o,
        pulumi.output(cmd).apply((cmd) => [cmd]),
    )
}
