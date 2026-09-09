import type { CellState } from "../../shared/types";

export const STATE_LABELS: Record<CellState, string> = {
	verified: "Verified by CI",
	declared: "Declared",
	unverified: "Unverified",
	advisory: "Advisory",
	unsupported: "Unsupported",
};

export const STATE_HELP: Record<CellState, string> = {
	verified: "A CI build succeeded with this toolchain version.",
	declared: "Declared compatible by the package or by maintainers; not verified by CI.",
	unverified: "Nothing is known, or the toolchain is newer than the declared range.",
	advisory: "A known issue applies to this combination; read the note.",
	unsupported: "Below the declared minimum, or a confirmed break.",
};
