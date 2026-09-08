# AetherMind — AI Native PKM

옵시디언을 넘어서는 AI 네이티브 개인 지식관리 시스템. 실시간 RAG 제안, 시맨틱 관계 그래프, 대화형 회상, 에이전틱 지식 정리, 그리고 **PC ↔ 안드로이드 기기 간 자동 동기화**를 지원합니다.

## 1. PC에서 실행하기

**요구사항:** Node.js 20+ (권장: 24), npm

```bash
npm install
cp .env.example .env   # GEMINI_API_KEY 값을 자신의 키로 교체
npm run dev             # http://localhost:3000
```

AI 기능(요약/시맨틱 분석/음성·이미지 캡처/대화형 회상)은 서버(`server.ts`)가 `GEMINI_API_KEY`를 이용해 Gemini API를 호출하는 방식입니다. 키가 없어도 앱은 동작하며, 이 경우 각 기능은 로컬 휴리스틱 폴백으로 동작합니다.

## 2. 안드로이드 앱으로 실행하기

이 저장소는 [Capacitor](https://capacitorjs.com)로 안드로이드 앱을 빌드합니다. 앱 자체는 정적 SPA로 패키징되어 폰에 설치되고, AI 호출과 기기 간 동기화는 **PC에서 실행 중인 서버**를 통해 이루어집니다(폰에 API 키를 둘 필요가 없습니다).

**요구사항:** Android Studio 또는 Android SDK + JDK 17/21(풀 JDK, JRE만으로는 `javac`가 없어 빌드 실패), `ANDROID_HOME` 환경변수.

```bash
npm run build        # dist/ 생성
npx cap sync android  # dist/ → android 프로젝트에 반영
cd android
./gradlew assembleDebug   # android/app/build/outputs/apk/debug/*.apk
```

생성된 APK를 폰에 설치(`adb install ...`)하거나 Android Studio에서 `android/` 폴더를 열어 직접 실행/디버깅할 수 있습니다.

> 코드를 수정한 뒤에는 항상 `npm run build && npx cap sync android`를 다시 실행해야 APK에 최신 웹 코드가 반영됩니다.

## 3. PC ↔ 모바일 기기 동기화

1. PC에서 `npm run dev`(또는 `npm start`)로 서버를 계속 실행해 둡니다. 서버는 `0.0.0.0:3000`에서 리슨하므로 같은 Wi‑Fi(LAN)의 다른 기기에서 접근할 수 있습니다.
2. PC의 LAN IP를 확인합니다 (예: `192.168.0.10`).
3. 폰 앱에서 **보관소(Vault) 탭 → 기기 간 동기화** 섹션에 `http://192.168.0.10:3000` 을 입력하고 저장합니다.
4. 이후 노트를 저장/삭제할 때마다 자동으로 백그라운드 동기화되며, 충돌은 최신 수정 시각(`updatedAt`) 기준으로 자동 해결됩니다.
5. 동기화 데이터는 PC의 `data/aethermind-sync.db`(SQLite)에만 저장됩니다 — 외부 클라우드로 전송되지 않습니다. 이 폴더는 `.gitignore`에 포함되어 있으니 커밋되지 않습니다.

같은 방식으로 PC 브라우저 자체(`http://localhost:3000`)도 동기화 대상 기기가 되므로, PC와 폰을 동시에 쓰는 워크플로가 자동으로 맞춰집니다.

### 문제 해결

- **"동기화 사용 불가"** 라고 뜨면: PC 서버가 켜져 있는지, 폰과 PC가 같은 네트워크에 있는지, 방화벽이 3000번 포트를 막고 있지 않은지 확인하세요.
- 안드로이드는 기본적으로 평문(HTTP) 통신을 차단하므로, `AndroidManifest.xml`에 `android:usesCleartextTraffic="true"`가 설정되어 있습니다(로컬 LAN 전용 서버이므로 안전).

## 4. 주요 기능

| 영역 | 설명 |
| --- | --- |
| 캡처 | 텍스트/음성/이미지로 노트 작성, 실시간 AI 사이드바 제안 |
| 그래프 | 노트 간 시맨틱 관계를 d3 기반 그래프로 시각화 |
| 회상 | 노트를 근거로 인용하며 답하는 대화형 RAG 챗 |
| 정리 | 자율 에이전트가 모순/오래된 노트/종합 제안을 스캔 |
| 보관소 | 백업/복원, 통계, PC ↔ 모바일 기기 간 동기화 설정 |

## 5. 스택

React 19 · TypeScript · Vite 6 · Tailwind CSS 4 · Express · Google Gemini API · Capacitor(Android) · IndexedDB(로컬 저장) · SQLite(동기화 서버) · vite-plugin-pwa
