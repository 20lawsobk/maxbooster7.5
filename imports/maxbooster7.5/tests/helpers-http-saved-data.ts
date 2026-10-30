import { withFixtureDatabase } from "./helpers-http-fixture";

/** A persisted read fixture, explicitly unrelated to live model output. */
export async function seedSavedCareerRecommendation(email: string): Promise<string> {
  return withFixtureDatabase(email, async client => {
    const result = await client.query(
      `INSERT INTO career_coach_recommendations(user_id,type,title,description,priority,metadata)
       SELECT id,'fixture-saved-read','Saved planning recommendation','Owned disposable persistence fixture',2,
              '{"fixture":true,"generationProven":false}'::jsonb
       FROM users WHERE email=$1 RETURNING id`, [email]);
    if (result.rowCount !== 1) throw new Error("Expected one owned recommendation fixture");
    return result.rows[0].id;
  });
}
