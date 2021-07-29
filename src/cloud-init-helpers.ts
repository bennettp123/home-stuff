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

export function addCmds(
    userData: pulumi.Input<
        {} & {
            runcmd?: pulumi.Input<string>[] | undefined
        }
    >,
    cmds: pulumi.Input<string>[],
) {
    return pulumi.all([userData, cmds]).apply(([userData, cmds]) => ({
        ...userData,
        runcmd: [...(userData.runcmd ?? []), ...cmds],
    }))
}

export function addCmd(
    userData: pulumi.Input<
        {} & {
            runcmd?: pulumi.Input<string>[] | undefined
        }
    >,
    cmd: pulumi.Input<string>,
) {
    return addCmds(userData, [cmd])
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
    userData: pulumi.Input<
        {} & { ssh_keys?: SshHostKeys | undefined; ssh_genkeytypes?: string[] }
    >,
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
                      ssh_genkeytypes: [
                          'ecdsa',
                          'ed25519',
                          /*
                      ...(userData.ssh_genkeytypes ?? []),
                      ...(args.ecdsa &&
                      args.ecdsaPub &&
                      (userData.ssh_genkeytypes ?? []).findIndex(
                          (e) => e === 'ecdsa',
                      ) !== -1
                          ? ['ecdsa']
                          : []),
                      ...(args.ed25519 &&
                      args.ed25519Pub &&
                      (userData.ssh_genkeytypes ?? []).findIndex(
                          (e) => e === 'ed25519',
                      ) !== -1
                          ? ['ed25519']
                          : []),
                      */
                      ],
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
                           * DSA probably works, but it's old and weak.
                           */

                          ...(args.rsa
                              ? (() => {
                                    pulumi.log.warn(
                                        `ignoring rsa keypair (it prevents sshd from starting for some reason)`,
                                    )
                                    return {}
                                })()
                              : {}),

                          ...(args.rsa
                              ? (() => {
                                    pulumi.log.warn(
                                        `ignoring dsa keypair (it's old and weak)`,
                                    )
                                    return {}
                                })()
                              : {}),

                          /*
                      ...(args.rsa
                          ? {
                                rsa_private: args.rsa,
                            }
                          : {}),
                      ...(args.rsaPub
                          ? {
                                rsa_public: args.rsaPub,
                            }
                          : {}),*/
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
                          : {}),*/
                      },
                  }
                : userData),
        }
    })
}
