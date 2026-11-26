"""Keep the original mini run method. Pass its transient Docker exec credential by name only."""
import hmac
import os

from approved_agent import MINI, PinnedMini

VARIABLE = "DEEPSEEK_API_KEY"


def by_name(command, value):
    if not command or command[0] != "exec":
        return command
    out = list(command)
    for i in range(1, len(out)):
        if out[i-1] == "-e" and out[i].startswith(VARIABLE + "="):
            if not hmac.compare_digest(out[i].partition("=")[2], value):
                raise RuntimeError("Docker exec credential handoff mismatch")
            out[i] = VARIABLE
    return out


class OrchardMini(PinnedMini):
    async def install(self, environment):
        from harbor.environments.docker.docker import DockerEnvironment
        if not isinstance(environment, DockerEnvironment):
            raise RuntimeError("The frozen Docker backend is required")
        value = os.environ[VARIABLE]
        compose = environment._run_docker_compose_command

        async def private_exec(command, *args, **kwargs):
            if command and command[0] == "exec":
                inherited = environment._compose_env_vars(include_os_env=True).get(VARIABLE, "")
                if not hmac.compare_digest(inherited, value):
                    raise RuntimeError("Docker Compose would change the inherited credential")
            return await compose(by_name(command, value), *args, **kwargs)

        environment._run_docker_compose_command = private_exec
        await super().install(environment)
        # Same container, same Python and provider configuration as the forthcoming agent.
        # Network is denied by the dry builder, and no inference method is called.
        await self.exec_as_agent(environment,
            command=f"{MINI}/bin/python -IB /opt/genxr-direct/orchard_header_guard.py --actual-container",
            env={VARIABLE: value})
