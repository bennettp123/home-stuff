# compose-stacks

Note: Currently broken. `docker compose` just returns exit code 15 :(

---

These are created using `docker compose` with an ecs context.

`~/.aws/config`:

```ini
[profile bennettp123]
output = json
region = ap-southeast-2
; (creds in ~/.aws/credentials)

[profile bennettp123-docker-compose]
region = ap-southeast-2
output = json
source_profile = bennettp123
role_arn = arn:aws:iam::841519609203:role/docker-compose-009280c
```

The role_arn above can be found in pulumi outputs `dockerComposeRole.roleArn`.

Then create the compose context

```sh
docker context create ecs bennettp123-docker-compose
```

and choose the profile `bennettp123-docker-compose`.
