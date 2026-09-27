UPDATE "settings"
SET
	"value" = jsonb_set(
		"value",
		'{taxEstimate}',
		jsonb_build_object(
			'shortTermRate', 24,
			'longTermRate', 15,
			'filingStatus', 'single',
			'projectedMagi', NULL,
			'otherNetInvestmentIncome', 0,
			'stateLocalRate', NULL,
			'taxableAccountIds', '[]'::jsonb,
			'confirmed', false
		),
		true
	),
	"updatedAt" = now()
WHERE NOT ("value" ? 'taxEstimate')
	OR jsonb_typeof("value"->'taxEstimate') <> 'object';
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM pg_constraint
		WHERE conname = 'settings_tax_estimate_object_check'
			AND conrelid = 'public.settings'::regclass
	) THEN
		ALTER TABLE public.settings
			ADD CONSTRAINT settings_tax_estimate_object_check
			CHECK (NOT (value ? 'taxEstimate') OR jsonb_typeof(value->'taxEstimate') = 'object');
	END IF;
END
$$;
