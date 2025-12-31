# FILE: py/ai.py
# FSM-basierte KI mit Zustandsgedächtnis
from browser import window
import json, math, random

# Globales Gedächtnis für FSM-Zustände pro Fighter ID
AI_MEMORY = {}

# Hilfsfunktionen
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
    """Versucht in optimale Reichweite zu kommen"""
    def execute(self, ctx):
        dist = ctx["dist"]
        opt_min = ctx["opt_range_min"]

        # Transition: Zu nah? -> Combat
        if dist < opt_min + 20:
            return "COMBAT" # Signal für Zustandswechsel

        # Action
        if ctx["cds"].get("dash", 0) <= 0 and dist > 250 and ctx["traits"]["aggression"] > 5:
            return "dash"

        return "move_towards"

class StateCombat(State):
    """Ist in Reichweite, nutzt Skills und Movement"""
    def enter(self, ctx):
        ctx["timer"] = random.randint(30, 90) # Bleibe mind. X Frames im Combat

    def execute(self, ctx):
        ctx["timer"] -= 1
        dist = ctx["dist"]
        opt_max = ctx["opt_range_max"]

        # Transition: Gegner rennt weg? -> Approach
        if dist > opt_max + 50:
            return "APPROACH"

        # Action: Angreifen oder Strafen
        # Nutze Skills basierend auf Cooldowns
        cds = ctx["cds"]

        # 1. Prio: Special/Spin wenn viele Gegner oder nah
        if dist < 80 and cds.get("spin", 0) <= 0:
            return "spin"

        # 2. Prio: Heavy Attack
        if dist < 100 and cds.get("attack_heavy", 0) <= 0 and random.random() < 0.1:
            return "attack_heavy"

        # 3. Prio: Light Attack
        if dist < 120 and random.random() < 0.2:
            return "attack_light"

        # Movement: Strafen oder Lücke schließen
        if dist > ctx["opt_range_min"]:
            return random.choice(["move_towards", "strafe_left", "strafe_right"])
        else:
            return random.choice(["move_away", "strafe_left", "strafe_right"])

class StateFlee(State):
    """Rückzug bei niedrigen HP"""
    def enter(self, ctx):
        ctx["flee_timer"] = 60 # Renne mindestens 1 Sekunde weg

    def execute(self, ctx):
        ctx["flee_timer"] -= 1
        dist = ctx["dist"]

        # Transition: Weit genug weg oder Timer abgelaufen? -> Heal oder Approach
        if ctx["flee_timer"] <= 0 and dist > 300:
            if ctx["hp_ratio"] < 0.6:
                return "HEAL"
            return "APPROACH"

        # Action: Wegrennen & Skills zur Flucht
        if ctx["cds"].get("dash", 0) <= 0:
            return "dash"
        if ctx["cds"].get("spin", 0) <= 0 and dist < 80:
            return "spin" # Defensive Spin

        return "move_away"

class StateHeal(State):
    """Versucht sich zu heilen"""
    def execute(self, ctx):
        # Transition: Voll geheilt oder Gegner zu nah?
        if ctx["hp_ratio"] > 0.85 or ctx["dist"] < 150:
            return "APPROACH"

        # Action
        if ctx["cds"].get("heal", 0) <= 0:
            return "heal"

        return "move_away" # Auf Distanz bleiben während CD

# Mapping der Zustands-Namen zu Klassen
STATES = {
    "APPROACH": StateApproach(),
    "COMBAT": StateCombat(),
    "FLEE": StateFlee(),
    "HEAL": StateHeal()
}

def update_fsm(fighter_id, state_obj):
    me = state_obj["self"]
    enemy = state_obj.get("closestEnemy")

    # 1. Memory initialisieren
    if fighter_id not in AI_MEMORY:
        AI_MEMORY[fighter_id] = {
            "current_state": "APPROACH",
            "timer": 0,
            "flee_timer": 0
        }

    mem = AI_MEMORY[fighter_id]

    # Keine Gegner? Idle.
    if not enemy:
        return "idle"

    # 2. Kontext aufbauen (Werte berechnen)
    traits = state_obj.get("personality", {})
    # Fallbacks falls Traits fehlen
    agg = traits.get("aggression", 5)
    risk = traits.get("riskTaking", 5)

    dist = get_dist(me, enemy)
    hp_ratio = me["hp"] / me["maxHp"]

    # Berechne dynamische Schwellwerte basierend auf Personality
    flee_threshold = 0.3 - (risk * 0.02) # Riskant: flieht erst bei 10%, Vorsichtig: bei 28%
    opt_range_min = 60 + (10 - agg) * 10  # Aggro: nah (60), Defensiv: fern (160)

    ctx = {
        "dist": dist,
        "hp_ratio": hp_ratio,
        "cds": state_obj.get("cooldowns", {}),
        "traits": traits,
        "opt_range_min": opt_range_min,
        "opt_range_max": opt_range_min + 100,
        "timer": mem.get("timer", 0),
        "flee_timer": mem.get("flee_timer", 0)
    }

    # 3. Globale Transitionen (Notfälle haben Vorrang)
    current = mem["current_state"]
    next_state = current

    # Notfall: Flucht
    if hp_ratio < flee_threshold and current != "FLEE" and current != "HEAL":
        next_state = "FLEE"

    # Notfall: Heilung möglich und nötig
    if hp_ratio < 0.6 and current != "COMBAT" and current != "FLEE" and ctx["cds"].get("heal", 0) <= 0:
        next_state = "HEAL"

    # 4. Zustands-Logik ausführen
    state_cls = STATES[next_state]

    # Wenn Zustand gewechselt hat, Enter aufrufen
    if next_state != current:
        state_cls.enter(ctx) # Kann Timer setzen
        # Werte zurück ins Memory schreiben
        mem["timer"] = ctx.get("timer", 0)
        mem["flee_timer"] = ctx.get("flee_timer", 0)

    # Execute gibt entweder eine Action string zurück ODER einen neuen State-Namen
    result = state_cls.execute(ctx)

    # Prüfen ob Ergebnis ein Zustandswechsel ist
    if result in STATES:
        mem["current_state"] = result
        # Rekursiv den neuen Zustand sofort ausführen (damit kein Frame verloren geht)
        return update_fsm(fighter_id, state_obj)

    # Zustand beibehalten
    mem["current_state"] = next_state

    # Timer-Updates speichern
    mem["timer"] = ctx.get("timer", 0)
    mem["flee_timer"] = ctx.get("flee_timer", 0)

    return result

def PY_AI_DECIDE(profile_id, state_json):
    try:
        state = json.loads(state_json)
        me_id = state["self"]["id"]
        return update_fsm(me_id, state)
    except Exception as e:
        # Fallback bei Fehlern
        return "idle"

window.PY_AI_DECIDE = PY_AI_DECIDE
window.PY_AI_READY = True
