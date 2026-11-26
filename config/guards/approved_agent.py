"""Use the installed mini distribution; the official Harbor.run method and agent instructions are inherited."""
from harbor.agents.installed.mini_swe_agent import MiniSweAgent

import os
import re

MINI = os.environ["GENXR_MINI_ENV"]
if not re.fullmatch(r"/[A-Za-z0-9_./-]+", MINI):
    raise ValueError("Use a Linux mini environment path without shell metacharacters.")
class PinnedMini(MiniSweAgent):
    async def install(self, environment):
        probe = "from importlib.metadata import version; assert tuple(map(version, ('mini-swe-agent','litellm','openai'))) == ('2.4.6','1.110.2','3.57.0')"
        cmd=(f"set -eu; test ! -f /tests/f2p.test.ts; test -r /opt/genxr-direct/model-prices.json; "
             f"test \"$MSWEA_MODEL_RETRY_STOP_AFTER_ATTEMPT\" = 1; {MINI}/bin/python -IB -c \"{probe}\"; "
             f"if test -e /usr/local/bin/mini-swe-agent; then test \"$(readlink -f /usr/local/bin/mini-swe-agent)\" = {MINI}/bin/mini-swe-agent; "
             f"else ln -s {MINI}/bin/mini-swe-agent /usr/local/bin/mini-swe-agent; fi")
        result=await environment.exec(command=cmd,user="root")
        if result.return_code:
            raise RuntimeError("Pinned direct mini install is unavailable.")
