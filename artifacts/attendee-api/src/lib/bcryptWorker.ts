import { Worker } from "worker_threads";

const workerCode = `
const { parentPort, workerData } = require("worker_threads");
const bcrypt = require("bcryptjs");

async function run() {
  try {
    let result;
    if (workerData.type === "hash") {
      result = await bcrypt.hash(workerData.data, workerData.saltOrHash);
    } else {
      result = await bcrypt.compare(workerData.data, workerData.saltOrHash);
    }
    parentPort.postMessage({ result });
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
}
run();
`;

interface BcryptTask {
  type: "hash" | "compare";
  data: string;
  saltOrHash: string | number;
}

function runInWorker(task: BcryptTask): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(workerCode, { eval: true, workerData: task });
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
