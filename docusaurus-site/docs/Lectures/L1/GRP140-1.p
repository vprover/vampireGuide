%--------------------------------------------------------------------------
% File     : GRP140-1 : TPTP v5.2.0. Bugfixed v1.2.1.
% Domain   : Group Theory (Lattice Ordered)
% Problem  : Prove greatest lower-bound axiom using a transformation
% Version  : [Fuc94] (equality) axioms.
% English  : This problem proves the original greatest lower-bound axiom
%            from the equational axiomatization.

% Refs     : [Fuc94] Fuchs (1994), The Application of Goal-Orientated Heuri
%          : [Sch95] Schulz (1995), Explanation Based Learning for Distribu
% Source   : [Sch95]
% Names    : ax_glb1c [Sch95]

% Status   : Unsatisfiable
% Rating   : 0.00 v5.1.0, 0.13 v5.0.0, 0.14 v4.1.0, 0.18 v4.0.1, 0.14 v4.0.0, 0.08 v3.7.0, 0.00 v3.4.0, 0.12 v3.3.0, 0.00 v2.1.0, 0.43 v2.0.0
% Syntax   : Number of clauses     :   18 (   0 non-Horn;  18 unit;   3 RR)
%            Number of atoms       :   18 (  18 equality)
%            Maximal clause size   :    1 (   1 average)
%            Number of predicates  :    1 (   0 propositional; 2-2 arity)
%            Number of functors    :    8 (   4 constant; 0-2 arity)
%            Number of variables   :   33 (   2 singleton)
%            Maximal term depth    :    3 (   2 average)
% SPC      : CNF_UNS_RFO_PEQ_UEQ

% Comments : ORDERING LPO inverse > product > greatest_lower_bound >
%            least_upper_bound > identity > a > b > c
%          : ORDERING LPO greatest_lower_bound > least_upper_bound >
%            inverse > product > identity > a > b > c
% Bugfixes : v1.2.1 - Duplicate axioms in GRP004-2.ax removed.
%--------------------------------------------------------------------------
%----Include equality group theory axioms

%----For any x and y in the group x*y is also in the group. No clause
%----is needed here since this is an instance of reflexivity

%----There exists an identity element
cnf(left_identity,axiom,
    ( multiply(identity,X) = X )).

%----For any x in the group, there exists an element y such that x*y = y*x
%----= identity.
cnf(left_inverse,axiom,
    ( multiply(inverse(X),X) = identity )).

%----The operation '*' is associative
cnf(associativity,axiom,
    ( multiply(multiply(X,Y),Z) = multiply(X,multiply(Y,Z)) )).

%----Include Lattice ordered group (equality) axioms

%----Specification of the least upper bound and greatest lower bound
cnf(symmetry_of_glb,axiom,
    ( greatest_lower_bound(X,Y) = greatest_lower_bound(Y,X) )).

cnf(symmetry_of_lub,axiom,
    ( least_upper_bound(X,Y) = least_upper_bound(Y,X) )).

cnf(associativity_of_glb,axiom,
    ( greatest_lower_bound(X,greatest_lower_bound(Y,Z)) = greatest_lower_bound(greatest_lower_bound(X,Y),Z) )).

cnf(associativity_of_lub,axiom,
    ( least_upper_bound(X,least_upper_bound(Y,Z)) = least_upper_bound(least_upper_bound(X,Y),Z) )).

cnf(idempotence_of_lub,axiom,
    ( least_upper_bound(X,X) = X )).

cnf(idempotence_of_gld,axiom,
    ( greatest_lower_bound(X,X) = X )).

cnf(lub_absorbtion,axiom,
    ( least_upper_bound(X,greatest_lower_bound(X,Y)) = X )).

cnf(glb_absorbtion,axiom,
    ( greatest_lower_bound(X,least_upper_bound(X,Y)) = X )).

%----Monotony of multiply
cnf(monotony_lub1,axiom,
    ( multiply(X,least_upper_bound(Y,Z)) = least_upper_bound(multiply(X,Y),multiply(X,Z)) )).

cnf(monotony_glb1,axiom,
    ( multiply(X,greatest_lower_bound(Y,Z)) = greatest_lower_bound(multiply(X,Y),multiply(X,Z)) )).

cnf(monotony_lub2,axiom,
    ( multiply(least_upper_bound(Y,Z),X) = least_upper_bound(multiply(Y,X),multiply(Z,X)) )).

cnf(monotony_glb2,axiom,
    ( multiply(greatest_lower_bound(Y,Z),X) = greatest_lower_bound(multiply(Y,X),multiply(Z,X)) )).

%--------------------------------------------------------------------------
cnf(ax_glb1c_1,hypothesis,
    ( greatest_lower_bound(a,c) = c )).

cnf(ax_glb1c_2,hypothesis,
    ( greatest_lower_bound(b,c) = c )).
%--------------------------------------------------------------------------
cnf(prove_ax_glb1c,negated_conjecture,
    (  least_upper_bound(greatest_lower_bound(a,b),c) != greatest_lower_bound(a,b) )).
%--------------------------------------------------------------------------
