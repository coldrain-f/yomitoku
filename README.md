# 読み解く React + TypeScript 앱

현재 정적 프로토타입을 React와 TypeScript로 옮긴 1차 구현이다. 기존 `../index.html`, `../styles.css`, `../app.js`는 시각적 기준 시안으로 유지한다.

## 구조

```text
src/
  App.tsx                  # 목업 상태, 라우트 가드, 기능 조립
  types.ts                 # 문항, 시도, 필터, 다이얼로그 도메인 타입
  components/              # 헤더, 다이얼로그와 재사용 UI
  features/readings/       # 목록, 풀이, 결과
  features/statistics/     # 학습 통계
  features/admin/          # 관리 목록, 편집, 생성, 미리보기
  lib/reading.js           # 표시·정렬·집계에 쓰는 순수 함수와 상수
  data.js                  # 현재 목업 데이터
```

화면의 CSS 클래스와 사용자 흐름은 정적 시안과 동일하게 유지한다. 실제 API를 붙일 때에는 기능 폴더 단위로 서버 상태를 교체한다.

## 실행

```powershell
npm install
npm run dev
```

개발 서버는 기본적으로 `http://localhost:5173`에서 실행된다.

## 검증

```powershell
npm run build
```

타입만 확인할 때는 다음 명령을 사용한다.

```powershell
npm run typecheck
```

## 현재 범위

- 목록, 검색, 필터, 페이지네이션
- 로그인/로그아웃 목업과 학습 시작 차단
- 선택지 셔플, 제출, 해설, 결과, 통계
- 관리자 목록, 편집, 생성, 미리보기, 보류, 게시, 삭제
- React Router 기반 화면 전환과 목록 필터 URL 쿼리
- TypeScript strict 모드 기반 도메인·컴포넌트·라우트 상태 검사
- Lucide React 아이콘과 기존 CSS 재사용

현재 사용자 인증, 문항, 시도, 통계 데이터는 React 메모리 상태다. 따라서 풀이와 결과 화면을 새로고침하면 목록으로 돌아간다. 실제 구현에서는 [데이터 및 API 명세](./docs/02-data-and-api-spec.md)의 API를 연결하고 서버 권한 검사를 적용한다.
