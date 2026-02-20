import {
  type getMyMembershipApiV1OrganizationsMeMemberGetResponse,
  useGetMyMembershipApiV1OrganizationsMeMemberGet,
} from "@/api/generated/organizations/organizations";
import type { ApiError } from "@/api/mutator";

export const isOrganizationAdminRole = (
  role: string | null | undefined
): boolean => role === "owner" || role === "admin";

export function useOrganizationMembership(
  isSignedIn: boolean | null | undefined
) {
  const membershipQuery = useGetMyMembershipApiV1OrganizationsMeMemberGet<
    getMyMembershipApiV1OrganizationsMeMemberGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      refetchOnMount: "always",
      retry: false,
    },
  });

  const member =
    membershipQuery.data?.status === 200 ? membershipQuery.data.data : null;

  return {
    membershipQuery,
    member,
    isAdmin: isOrganizationAdminRole(member?.role),
  };
}
