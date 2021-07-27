import * as pulumi from '@pulumi/pulumi'

export function makeCloudInitUserdata(
    o: pulumi.Input<{}>,
): pulumi.Output<string> {
    return pulumi.interpolate`#cloud-config
${JSON.stringify(o)}
`
}

export function addCmds(
    userdata: pulumi.Input<
        {} & {
            runcmd?: pulumi.Input<string>[] | pulumi.Input<string[]> | undefined
        }
    >,
    cmds: pulumi.Input<string[]> | pulumi.Input<string>[],
) {
    return pulumi
        .all([userdata, cmds])
        .apply(
            ([userdata, cmds]) =>
                (userdata.runcmd = [...(userdata.runcmd ?? []), ...cmds]),
        )
}

export function addCmd(
    userdata: pulumi.Input<
        {} & {
            runcmd?: pulumi.Input<string>[] | pulumi.Input<string[]> | undefined
        }
    >,
    cmd: pulumi.Input<string>,
) {
    return addCmds(
        userdata,
        pulumi.output(cmd).apply((cmd) => [cmd]),
    )
}

export type SshHostKeys = {
    rsaPrivate?: pulumi.Input<string>
    rsaPublic?: pulumi.Input<string>
    dsaPrivate?: pulumi.Input<string>
    dsaPublic?: pulumi.Input<string>
    ecdsaPrivate?: pulumi.Input<string>
    ecdsaPublic?: pulumi.Input<string>
    ed25519Private?: pulumi.Input<string>
    ed25519Public?: pulumi.Input<string>
}

export function addHostKeys(
    userdata: pulumi.Input<{} & { ssh_keys?: SshHostKeys | undefined }>,
    args: SshHostKeys,
) {
    return pulumi.output(userdata).apply((userdata) =>
        pulumi
            .all([
                args.rsaPrivate,
                args.rsaPublic,
                args.dsaPrivate,
                args.dsaPublic,
                args.ecdsaPrivate,
                args.ecdsaPublic,
                args.ed25519Private,
                args.ed25519Public,
            ])
            .apply(
                ([
                    rsa_private,
                    rsa_public,
                    dsa_private,
                    dsa_public,
                    ecdsa_private,
                    ecdsa_public,
                    ed25519_private,
                    ed25519_public,
                ]) =>
                    (userdata.ssh_keys = {
                        ...(userdata.ssh_keys ?? {}),
                        ...{
                            ...(rsa_private
                                ? {
                                      rsa_private,
                                  }
                                : {}),
                            ...(rsa_public
                                ? {
                                      rsa_public,
                                  }
                                : {}),
                            ...(dsa_private
                                ? {
                                      dsa_private,
                                  }
                                : {}),
                            ...(dsa_public
                                ? {
                                      dsa_public,
                                  }
                                : {}),
                            ...(ecdsa_private
                                ? {
                                      ecdsa_private,
                                  }
                                : {}),
                            ...(ecdsa_public
                                ? {
                                      ecdsa_public,
                                  }
                                : {}),
                            ...(ed25519_private
                                ? {
                                      ed25519_private,
                                  }
                                : {}),
                            ...(ed25519_public
                                ? {
                                      ed25519_public,
                                  }
                                : {}),
                        },
                    }),
            ),
    )
}
