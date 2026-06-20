/** Auth-derived request context. The Gateway resolves these from the access token. */
export interface RequestContext {
  tenantId: string;
  /** The acting principal. */
  subjectId: string;
  /** Memory owner (usually equals subjectId). */
  ownerId: string;
  clientId?: string;
  platform?: string;
}
