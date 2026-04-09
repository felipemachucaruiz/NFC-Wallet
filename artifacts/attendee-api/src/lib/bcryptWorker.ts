import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);

interface BcryptTask {
  type: "hash" | "compare";
  data: string;
  saltOrHash: string | number;
}

if (!isMainThread && parentPort) {
  const task = workerData as BcryptTask;
  import("bcryptjs").then(async (bcrypt) => {
    try {
      let result: string | boolean;
      if (task.type === "hash") {
        result = await bcrypt.default.hash(task.data, task.saltOrHash as number);
      } else {
        result = await bcrypt.default.compare(task.data, task.saltOrHash as string);
      }
      parentPort!.postMessage({ result });
    } catch (err: any) {
      parentPort!.postMessage({ error: err.message });
    }
  });
}

function runInWorker(task: BcryptTask): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: task });
    worker.on("message", (msg) => {
      if (msg.error) reject(new Error(msg.error));
      else resolve(msg.result);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

export async function hashPassword(password: string, rounds = 10): Promise<string> {
  return runInWorker({ type: "hash", data: password, saltOrHash: rounds });
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return runInWorker({ type: "compare", data: password, saltOrHash: hash });
}
