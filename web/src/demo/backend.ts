import { MiniCloud, type MiniCloudState } from "../../../src/domain/store";
import { IntentGuard, type IntentGuardState } from "../../../src/guard/guard";
import { createApp } from "../../../src/server/app";
import { setTransport } from "../api";

// 저장 형식이 바뀌면 버전을 올린다. 예전 형식은 무시하고 시드 데이터로 시작한다.
const STORAGE_KEY = "intentguard.demo.v1";

interface Saved {
  cloud: MiniCloudState;
  guard: IntentGuardState;
}

export type DemoRequest = (path: string, init?: RequestInit) => Promise<Response>;

/** 서버와 같은 Hono 앱을 탭 안에서 실행한다. 상태는 탭마다 따로이고 새로고침해도 남는다. */
export function startDemoBackend(): DemoRequest {
  const cloud = new MiniCloud();
  const guard = new IntentGuard(cloud);

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Saved;
      cloud.importState(saved.cloud);
      guard.importState(saved.guard);
    }
  } catch {
    cloud.reset();
    guard.reset();
  }

  const save = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ cloud: cloud.exportState(), guard: guard.exportState() } satisfies Saved));
    } catch {
      // 저장 공간이 막혀도 데모는 돌아간다. 새로고침 때 초기화될 뿐이다.
    }
  };

  const app = createApp(cloud, guard);
  const request: DemoRequest = async (path, init) => {
    const response = await app.request(new URL(path, location.origin).href, init);
    save();
    return response;
  };

  // 요청 사이에 끝난 상태 전이도 남긴다.
  window.addEventListener("pagehide", save);
  setTransport(request);
  return request;
}
