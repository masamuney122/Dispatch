export interface Environment {
    id: string;
    name: string;
    variables: Record<string, string>;
    workspace_id?: string | null;
    created_at?: string;
    updated_at?: string;
}
