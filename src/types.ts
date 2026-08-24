export interface SessionData {
  memberId?: number;
  familyId?: number;
  lineUserId?: string;
  lineDisplayName?: string;
  csrfToken?: string;
  authRedirectAttempts?: number;
  iat: number;
}

export interface CurrentMember {
  id: number;
  family_id: number;
  name: string;
  line_user_id?: string | null;
  active: number;
  [key: string]: unknown;
}
