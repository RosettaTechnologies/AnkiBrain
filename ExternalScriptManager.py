import asyncio
import atexit
import json
import platform
import subprocess

from InterprocessCommand import InterprocessCommand

class ExternalScriptManager:
    def __init__(self, python_path, script_path):
        self.python_path = python_path
        self.script_path = script_path
        self.process = None
        self.lock = asyncio.Lock()

    async def start(self):
        creationflags = 0
        if platform.system() == 'Windows':
            creationflags = subprocess.CREATE_NO_WINDOW

        self.process = await asyncio.create_subprocess_exec(
            self.python_path,
            self.script_path,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            creationflags=creationflags,
            limit=1024 * 1024 * 1024 * 1024  # 1 GB
        )

        atexit.register(self.process.terminate)

        # Wait for the ready message from external script.
        print('Waiting for ChatAI Ready Message')
        ready_msg = await self.process.stdout.readline()

        # async def read_all(stream):
        #     output = []
        #     while True:
        #         line = await stream.readline()
        #         if not line:
        #             break
        #         output.append(line.decode().strip())
        #     return '\n'.join(output)
        
        # error_msg = await read_all(self.process.stderr)
        # print(error_msg)

        ready_data = json.loads(ready_msg.decode().strip())
        if ready_data['status'] == 'success':
            print('Completed startup of ChatAI module')
        else:
            raise Exception('Error starting ChatAI module')

    async def stop(self):
        if self.process is not None:
            self.process.terminate()
            await self.process.wait()

    def terminate_sync(self):
        if self.process is None:
            return

        print('Terminating ChatAI subprocess...')
        self.process.terminate()

    async def call(self, input_data: dict[str, str]) -> dict[str, str]:
        try:
            data_str: str = json.dumps(input_data)
            async with self.lock:  # Acquire lock before writing and draining
                self.process.stdin.write(data_str.encode() + b'\n')
                await self.process.stdin.drain()

            output_str = await self.process.stdout.readline()
            async with self.lock:  # Acquire lock again before loading the json
                output_data = json.loads(output_str.decode().strip())

            # Handle module error.
            if output_data['cmd'] == InterprocessCommand.SUBMODULE_ERROR.value:
                error_msg = output_data['data']['error']
                raise Exception(error_msg)

            return output_data
        except Exception as e:
            raise Exception(str(e))
            # print(e)
            # return {
            #     'cmd': 'SUBMODULE_ERROR',
            #     'data': {
            #         'error': str(e)
            #     }
            # }
