import { z } from "zod";

// CSP가 eval을 막으므로 zod가 eval을 시험하지 않게 한다. 스키마보다 먼저 불러와야 한다.
z.config({ jitless: true });
