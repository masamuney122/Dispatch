import { invoke } from "@tauri-apps/api/core";
import type { Environment } from "../types/environment";

export async function createEnvironment(
    name: string,
    variables: Record<string, string>
): Promise<Environment> {
    return invoke<Environment>("create_environment", { name, variables });
}

export async function listEnvironments(): Promise<Environment[]> {
    return invoke<Environment[]>("list_environments");
}

export async function updateEnvironment(
    id: string,
    name: string,
    variables: Record<string, string>
): Promise<Environment> {
    return invoke<Environment>("update_environment", { id, name, variables });
}

export async function deleteEnvironment(id: string): Promise<void> {
    return invoke<void>("delete_environment", { id });
}

export async function setActiveEnvironment(id: string | null): Promise<void> {
    return invoke<void>("set_active_environment", { id });
}

export async function getActiveEnvironment(): Promise<Environment | null> {
    return invoke<Environment | null>("get_active_environment");
}
