import * as pulumi from '@pulumi/pulumi'

export function makeCloudInitUserdata(
    userData: pulumi.Input<{}>,
): pulumi.Output<string> {
    return pulumi
        .output(userData)
        .apply((userData) =>
            ['#cloud-config', JSON.stringify(userData).trimStart()].join('\n'),
        )
}

export function prependCmds(
    userData: pulumi.Input<{
        runcmd?: pulumi.Input<string>[] | undefined
        [key: string]: unknown
    }>,
    cmds: pulumi.Input<string>[] | pulumi.Input<string[]>,
) {
    return pulumi.all([cmds, userData]).apply(([cmds, userData]) => {
        return pulumi.all(cmds).apply((cmds) => ({
            ...userData,
            runcmd: [...cmds, ...(userData.runcmd ?? [])],
        }))
    })
}

export function appendCmds(
    userData: pulumi.Input<{
        runcmd?: pulumi.Input<string>[] | undefined
        [key: string]: unknown
    }>,
    cmds: pulumi.Input<string>[] | pulumi.Input<string[]>,
) {
    return pulumi.all([cmds, userData]).apply(([cmds, userData]) => {
        return pulumi.all(cmds).apply((cmds) => ({
            ...userData,
            runcmd: [...(userData.runcmd ?? []), ...cmds],
        }))
    })
}

export function appendCmd(
    userData: pulumi.Input<{
        runcmd?: pulumi.Input<string>[] | undefined
        [key: string]: unknown
    }>,
    cmd: pulumi.Input<string>,
) {
    return pulumi.all([cmd, userData]).apply(([cmd, userData]) => ({
        ...userData,
        runcmd: [...(userData.runcmd ?? []), cmd],
    }))
}

export function prependCmd(
    userData: pulumi.Input<{
        runcmd?: pulumi.Input<string>[] | undefined
        [key: string]: unknown
    }>,
    cmd: pulumi.Input<string>,
) {
    return pulumi.all([cmd, userData]).apply(([cmd, userData]) => ({
        ...userData,
        runcmd: [cmd, ...(userData.runcmd ?? [])],
    }))
}

export function addRepo(
    userData:
        | pulumi.Input<{
              yum_repos: { [key: string]: unknown }
              [key: string]: unknown
          }>
        | undefined,
    repo: pulumi.Input<{ [key: string]: any }>,
) {
    return pulumi.all([repo, userData]).apply(([repo, userData]) => ({
        ...(userData ?? {}),
        yum_repos: {
            ...(userData ?? {}).yum_repos,
            ...repo,
        },
    }))
}

export type SshHostKeys = {
    rsa?: string
    rsaPub?: string
    dsa?: string
    dsaPub?: string
    ecdsa?: string
    ecdsaPub?: string
    ed25519?: string
    ed25519Pub?: string
}

export function addHostKeys(
    userData: pulumi.Input<{
        ssh_keys?: SshHostKeys | undefined
        [key: string]: unknown
    }>,
    args: pulumi.Input<SshHostKeys>,
) {
    return pulumi.all([userData, args]).apply(([userData, args]) => {
        if ((args.ecdsa && !args.ecdsaPub) || (!args.ecdsa && args.ecdsaPub)) {
            throw new pulumi.RunError(
                'one or more key missing from ecda ssh keypair',
            )
        }
        if (
            (args.ed25519 && !args.ed25519Pub) ||
            (!args.ed25519 && args.ed25519Pub)
        ) {
            throw new pulumi.RunError(
                'one or more key missing from ecda ssh keypair',
            )
        }
        return {
            ...userData,
            ...(Object.values(args).some((e) => e !== undefined)
                ? {
                      ssh_keys: {
                          ...(userData.ssh_keys ?? {}),
                          ...(args.ecdsa
                              ? {
                                    ecdsa_private: args.ecdsa,
                                }
                              : {}),
                          ...(args.ecdsaPub
                              ? {
                                    ecdsa_public: args.ecdsaPub,
                                }
                              : {}),
                          ...(args.ed25519
                              ? {
                                    ed25519_private: args.ed25519,
                                }
                              : {}),
                          ...(args.ed25519Pub
                              ? {
                                    ed25519_public: args.ed25519Pub,
                                }
                              : {}),

                          /**
                           * RSA doesn't work for some reason.
                           * Probably too big for userData
                           */
                          /*
                          ...(args.rsa
                              ? (() => {
                                    pulumi.log.warn(
                                        `ignoring rsa keypair (it prevents sshd from starting for some reason)`,
                                    )
                                    return {}
                                })()
                              : {}),
                          */
                          ...(args.dsa
                              ? (() => {
                                    pulumi.log.warn(
                                        `ignoring dsa keypair (it's old and weak)`,
                                    )
                                    return {}
                                })()
                              : {}),

                          ...(args.rsa
                              ? {
                                    rsa_private: args.rsa,
                                }
                              : {}),
                          ...(args.rsaPub
                              ? {
                                    rsa_public: args.rsaPub,
                                }
                              : {}),
                          /**
                           * DSA probably works fine, but it's old and weak.
                           */
                          /*
                          ...(args.dsa
                              ? {
                                    dsa_private: args.dsa,
                                }
                            : {}),
                          ...(args.dsaPub
                              ? {
                                    dsa_public: args.dsaPub,
                                }
                              : {}),
                          */
                      },
                  }
                : userData),
        }
    })
}
