# FILE: py/ai.py
# Smarte FSM-KI mit Skill-Awareness und Energy-Checks
from browser import window
import json, math, random

AI_MEMORY = {}

def get_dist(a, b):
    dx = b["x"] - a["x"]
    dy = b["y"] - a["y"]
    return (dx*dx + dy*dy) ** 0.5

# --- STATES ---

class State:
    def enter(self, ctx): pass
    def execute(self, ctx): return "idle"
    def exit(self, ctx): pass

class StateApproach(State):
    def execute(self, ctx):
        dist = ctx["dist"]
        me = ctx["me"]
        skills = ctx["skills"]

        # Wir wollen in Reichweite des längsten Angriffs kommen
        range_l = skills["light"]["range"] if skills["light"]["valid"] else 50
        range_h = skills["heavy"]["range"] if skills["heavy"]["valid"] else 50

        # Optimale Distanz ist etwas weniger als die max Reichweite
        best_range = max(range_l, range_h)
        opt_dist = best_range * 0.8

        if dist < opt_dist:
            return "COMBAT"

        if ctx["cds"].get("dash", 0) <= 0 and dist > 300 and ctx["traits"]["aggression"] > 5:
            # Energie Check für Dash
            if me["en"] > 20:
                return "dash"

        return "move_towards"

class StateCombat(State):
    def enter(self, ctx):
        ctx["timer"] = random.randint(20, 60)

    def execute(self, ctx):
        ctx["timer"] -= 1
        dist = ctx["dist"]
        me = ctx["me"]
        skills = ctx["skills"]

        # Wenn Gegner zu weit weg, zurück zu Approach
        max_range = skills["light"]["range"] if skills["light"]["valid"] else 60
        if dist > max_range + 100:
            return "APPROACH"

        # --- Skill Logik mit Range & Energy Check ---

        # 1. SPECIAL / SPIN (Slot 3)
        s = skills["spin"]
        if s["valid"] and s["is_ready"] and me["en"] >= s["cost"]:
            if dist <= s["range"] + 20:
                return "spin"

        # 2. HEAVY ATTACK (Slot 2)
        s = skills["heavy"]
        if s["valid"] and s["is_ready"] and me["en"] >= s["cost"]:
            if dist <= s["range"] + 10:
                if random.random() < (ctx["traits"]["aggression"] / 10.0):
                    return "attack_heavy"

        # 3. LIGHT ATTACK (Slot 1)
        s = skills["light"]
        if s["valid"] and s["is_ready"] and me["en"] >= s["cost"]:
            if dist <= s["range"] + 15:
                return "attack_light"

        # Movement während Combat
        if dist > max_range * 0.7:
            return "move_towards"
        elif dist < max_range * 0.4:
            return "move_away"
        else:
            return random.choice(["strafe_left", "strafe_right", "idle"])

class StateFlee(State):
    def enter(self, ctx):
        ctx["flee_timer"] = 45

    def execute(self, ctx):
        ctx["flee_timer"] -= 1
        dist = ctx["dist"]
        me = ctx["me"]

        if ctx["flee_timer"] <= 0 and dist > 350:
            if ctx["hp_ratio"] < 0.6:
                return "HEAL"
            return "APPROACH"

        # Wegrennen
        if ctx["cds"].get("dash", 0) <= 0 and me["en"] > 20:
            return "dash"

        return "move_away"

class StateHeal(State):
    def execute(self, ctx):
        me = ctx["me"]
        skills = ctx["skills"]

        # Wenn voll geheilt oder Gegner zu nah
        if ctx["hp_ratio"] > 0.9 or ctx["dist"] < 120:
            return "APPROACH"

        # Skill Check (Slot 4 - Heal)
        s = skills["heal"]

        if s["valid"] and s["is_ready"]:
            # CRITICAL FIX: Check Energy!
            if me["en"] >= s["cost"]:
                return "heal"
            else:
                # Nicht genug Energie? Nicht einfrieren! Weglaufen und regenerieren.
                return "move_away"

        if not s["is_ready"]:
            return "move_away" # Cooldown abwarten

        return "move_away"

STATES = {
    "APPROACH": StateApproach(),
    "COMBAT": StateCombat(),
    "FLEE": StateFlee(),
    "HEAL": StateHeal()
}

def update_fsm(fighter_id, state_obj):
    me = state_obj["self"]
    enemy = state_obj.get("closestEnemy")

    if fighter_id not in AI_MEMORY:
        AI_MEMORY[fighter_id] = { "current_state": "APPROACH", "timer": 0, "flee_timer": 0 }
    mem = AI_MEMORY[fighter_id]

    if not enemy: return "idle"

    traits = state_obj.get("personality", {})
    agg = traits.get("aggression", 5)

    dist = get_dist(me, enemy)
    hp_ratio = me["hp"] / me["maxHp"]

    # Skills mit Fallback falls nicht vorhanden
    skills = state_obj.get("skills", {})
    default_skill = { "valid": False, "range": 50, "cost": 0, "is_ready": False }
    for slot in ["light", "heavy", "spin", "heal"]:
        if slot not in skills:
            skills[slot] = default_skill

    # Context bauen
    ctx = {
        "me": me,
        "enemy": enemy,  # WICHTIG: Für zukünftige Taktik-Module
        "dist": dist,
        "hp_ratio": hp_ratio,
        "cds": state_obj.get("cooldowns", {}),
        "skills": skills,
        "traits": traits,
        "timer": mem.get("timer", 0),
        "flee_timer": mem.get("flee_timer", 0)
    }

    current = mem["current_state"]
    next_state = current

    # Globale Transitionen
    if hp_ratio < 0.25 and current != "FLEE" and current != "HEAL":
        next_state = "FLEE"
    elif hp_ratio < 0.6 and current != "COMBAT" and current != "FLEE":
        # Nur heilen, wenn wir den Skill auch haben und genug Energie!
        heal_skill = skills["heal"]
        if heal_skill["valid"] and heal_skill["is_ready"] and me["en"] >= heal_skill["cost"]:
            next_state = "HEAL"

    # FSM Update mit Loop-Schutz
    transitions = 0
    while transitions < 3:
        state_cls = STATES[next_state]
        if next_state != current:
            state_cls.enter(ctx)
            mem["timer"] = ctx.get("timer", 0)
            mem["flee_timer"] = ctx.get("flee_timer", 0)
            current = next_state

        result = state_cls.execute(ctx)

        if result in STATES:
            next_state = result
            transitions += 1
        else:
            # Action gefunden
            mem["current_state"] = next_state
            mem["timer"] = ctx.get("timer", 0)
            mem["flee_timer"] = ctx.get("flee_timer", 0)
            return result

    return "idle" # Fallback bei Loop

def PY_AI_DECIDE(profile_id, state_json):
    try:
        state = json.loads(state_json)
        me_id = state["self"]["id"]
        return update_fsm(me_id, state)
    except Exception as e:
        print(f"[PY_AI] Error: {e}")
        print(f"[PY_AI] JSON (first 200 chars): {state_json[:200] if state_json else 'None'}")
        return "idle"

window.PY_AI_DECIDE = PY_AI_DECIDE
window.PY_AI_READY = True
