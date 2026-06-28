import { useEffect, useCallback, useRef } from "react";
import { useShortcuts } from "@/contexts/ShortcutContext";
import { Command } from "@/lib/commands/CommandRegistry";

export interface UseCommandsOptions {
  commands: Command[];
  enabled?: boolean;
}

export function useCommands(options: UseCommandsOptions) {
  const { registerCommand, unregisterCommand, executeCommand, searchCommands } =
    useShortcuts();
  const registeredIdsRef = useRef<string[]>([]);
  const { commands, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    const ids: string[] = [];
    commands?.forEach((command) => {
      registerCommand(command);
      ids?.push(command?.id);
    });
    registeredIdsRef.current = ids;

    return () => {
      ids?.forEach((id) => unregisterCommand(id));
      registeredIdsRef.current = [];
    };
  }, [commands, enabled, registerCommand, unregisterCommand]);

  const execute = useCallback(
    async (commandId: string) => {
      await executeCommand(commandId);
    },
    [executeCommand],
  );

  const search = useCallback(
    (query: string) => {
      return searchCommands(query);
    },
    [searchCommands],
  );

  return {
    execute,
    search,
    registeredIds: registeredIdsRef.current,
  };
}

export function useCommand(command: Omit<Command, "id"> & { id?: string }) {
  const { registerCommand, unregisterCommand, executeCommand } = useShortcuts();
  const idRef = useRef(
    command?.id || `cmd-${Math?.random().toString(36).substr(2, 9)}`,
  );

  useEffect(() => {
    const fullCommand: Command = {
      ...command,
      id: idRef.current,
    };
    registerCommand(fullCommand);

    return () => {
      unregisterCommand(idRef?.current);
    };
  }, [command?.name, command?.action]);

  const execute = useCallback(async () => {
    await executeCommand(idRef?.current);
  }, [executeCommand]);

  return { execute, id: idRef.current };
}

export function useCommandExecution() {
  const { executeCommand, searchCommands, recentCommands } = useShortcuts();

  const execute = useCallback(
    async (commandId: string) => {
      await executeCommand(commandId);
    },
    [executeCommand],
  );

  const search = useCallback(
    (query: string) => {
      return searchCommands(query);
    },
    [searchCommands],
  );

  return {
    execute,
    search,
    recentCommands,
  };
}

export default useCommands;
