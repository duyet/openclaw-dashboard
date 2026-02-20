export type ActorType = 'user' | 'agent';

export interface UserActor {
  type: 'user';
  userId: string;
  clerkId: string;
  orgId?: string;
}

export interface AgentActor {
  type: 'agent';
  agentId: string;
  orgId?: string;
}

export type Actor = UserActor | AgentActor;
