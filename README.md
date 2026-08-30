# 読み解く React 앱

현재 정적 프로토타입을 React로 옮긴 1차 구현이다. 기존 `../index.html`, `../styles.css`, `../app.js`는 시각적 기준 시안으로 유지한다.

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

## 현재 범위

- 목록, 검색, 필터, 페이지네이션
- 로그인/로그아웃 목업과 학습 시작 차단
- 선택지 셔플, 제출, 해설, 결과, 통계
- 관리자 목록, 편집, 생성, 미리보기, 보류, 게시, 삭제
- Lucide React 아이콘과 기존 CSS 재사용

현재 사용자 인증, 문항, 시도, 통계 데이터는 React 메모리 상태다. 실제 구현에서는 `../docs/02-data-and-api-spec.md`의 API를 연결하고 서버 권한 검사를 적용한다.
